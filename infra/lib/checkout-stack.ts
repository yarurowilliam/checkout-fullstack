import { CfnOutput, Duration, Fn, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';

export interface CheckoutStackProps extends StackProps {
  repoUrl: string;
  repoBranch: string;
  cloudFrontPrefixList: string;
  gatewayOrigin: string;
}

/**
 * - Frontend: S3 privado + CloudFront (HTTPS y cabeceras de seguridad).
 * - API + PostgreSQL: una instancia EC2 con Docker Compose, accesible solo desde CloudFront (/api/*).
 * - Secretos: SSM Parameter Store (SecureString bajo /checkout/), creados fuera del stack.
 */
export class CheckoutStack extends Stack {
  constructor(scope: Construct, id: string, props: CheckoutStackProps) {
    super(scope, id, props);

    // ---------- Red: subred pública sin NAT (la instancia sale a internet por su IP pública) ----------
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [{ name: 'public', subnetType: ec2.SubnetType.PUBLIC }],
    });

    const apiSg = new ec2.SecurityGroup(this, 'ApiSg', { vpc, description: 'API: solo trafico desde CloudFront' });
    apiSg.addIngressRule(ec2.Peer.prefixList(props.cloudFrontPrefixList), ec2.Port.tcp(80), 'CloudFront');

    // ---------- Instancia de la API ----------
    const role = new iam.Role(this, 'ApiRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')],
    });
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParametersByPath'],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/checkout`, `arn:aws:ssm:${this.region}:${this.account}:parameter/checkout/*`],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: ['*'],
        conditions: { StringEquals: { 'kms:ViaService': `ssm.${this.region}.amazonaws.com` } },
      }),
    );

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'set -euxo pipefail',
      'dnf install -y docker git',
      'mkdir -p /usr/local/lib/docker/cli-plugins',
      'curl -fsSL https://github.com/docker/compose/releases/download/v2.39.4/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose',
      'chmod +x /usr/local/lib/docker/cli-plugins/docker-compose',
      // 1 GB de RAM: swap para compilar la imagen.
      'fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile',
      "echo '/swapfile swap swap defaults 0 0' >> /etc/fstab",
      'systemctl enable --now docker',
      `git clone --branch ${props.repoBranch} ${props.repoUrl} /opt/checkout`,
      `echo 'BRANCH=${props.repoBranch}' > /etc/checkout.env`,
      'bash /opt/checkout/deploy/redeploy.sh',
    );

    const instance = new ec2.Instance(this, 'Api', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: apiSg,
      role,
      userData,
      requireImdsv2: true,
      blockDevices: [{ deviceName: '/dev/xvda', volume: ec2.BlockDeviceVolume.ebs(16, { encrypted: true, volumeType: ec2.EbsDeviceVolumeType.GP3 }) }],
    });

    const eip = new ec2.CfnEIP(this, 'ApiIp', { domain: 'vpc', instanceId: instance.instanceId });
    // CloudFront necesita un nombre DNS como origen: el DNS público que AWS asigna a la IP elástica.
    const apiDns = Fn.join('', ['ec2-', Fn.join('-', Fn.split('.', eip.ref)), '.compute-1.amazonaws.com']);

    // ---------- Frontend ----------
    const site = new s3.Bucket(this, 'Site', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      `connect-src 'self' ${props.gatewayOrigin}`.trim(),
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ');

    const headers = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        contentSecurityPolicy: { contentSecurityPolicy: csp, override: true },
        strictTransportSecurity: { accessControlMaxAge: Duration.days(730), includeSubdomains: true, preload: true, override: true },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
      },
      customHeadersBehavior: {
        customHeaders: [{ header: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()', override: true }],
      },
    });

    const distribution = new cloudfront.Distribution(this, 'Cdn', {
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(site),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: headers,
        compress: true,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(apiDns, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            readTimeout: Duration.seconds(30),
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    // Assets con hash: caché de un año. index.html e imágenes: revalidar siempre.
    const assets = new s3deploy.BucketDeployment(this, 'DeployAssets', {
      sources: [s3deploy.Source.asset('../frontend/dist/assets')],
      destinationBucket: site,
      destinationKeyPrefix: 'assets/',
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=31536000, immutable')],
      prune: false,
    });
    const pages = new s3deploy.BucketDeployment(this, 'DeployPages', {
      sources: [s3deploy.Source.asset('../frontend/dist', { exclude: ['assets', 'assets/**'] })],
      destinationBucket: site,
      cacheControl: [s3deploy.CacheControl.fromString('no-cache')],
      prune: false,
      distribution,
      distributionPaths: ['/*'],
    });
    pages.node.addDependency(assets);

    new CfnOutput(this, 'AppUrl', { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, 'ApiInstanceId', { value: instance.instanceId });
    new CfnOutput(this, 'ApiOriginDns', { value: apiDns });
  }
}
