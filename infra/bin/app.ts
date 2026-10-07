import { App } from 'aws-cdk-lib';
import { CheckoutStack } from '../lib/checkout-stack';

const app = new App();

new CheckoutStack(app, 'CheckoutStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  repoUrl: app.node.getContext('repoUrl'),
  repoBranch: app.node.getContext('repoBranch'),
  cloudFrontPrefixList: app.node.getContext('cloudFrontPrefixList'),
  // Origen de la pasarela para la CSP; se pasa al desplegar (-c gatewayOrigin=...) para no versionarlo.
  gatewayOrigin: app.node.tryGetContext('gatewayOrigin') ?? '',
});
