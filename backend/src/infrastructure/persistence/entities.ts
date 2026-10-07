import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  Relation,
  UpdateDateColumn,
} from 'typeorm';

@Entity('products')
@Check('"stock" >= 0')
export class ProductEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() name: string;
  @Column('text') description: string;
  @Column('int', { name: 'price_in_cents' }) priceInCents: number;
  @Column('int') stock: number;
  @Column({ name: 'image_url' }) imageUrl: string;
}

@Entity('customers')
export class CustomerEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) email: string;
  @Column({ name: 'full_name' }) fullName: string;
  @Column() phone: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('transactions')
export class TransactionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) reference: string;
  @Column('uuid', { name: 'product_id' }) productId: string;
  @ManyToOne(() => ProductEntity, { nullable: false }) @JoinColumn({ name: 'product_id' }) product: ProductEntity;
  @ManyToOne(() => CustomerEntity, { nullable: false }) @JoinColumn({ name: 'customer_id' }) customer: CustomerEntity;
  @OneToOne(() => DeliveryEntity, (d) => d.transaction) delivery: Relation<DeliveryEntity>;
  @Column('int') quantity: number;
  @Column('int', { name: 'amount_in_cents' }) amountInCents: number;
  @Column('int', { name: 'base_fee_in_cents' }) baseFeeInCents: number;
  @Column('int', { name: 'delivery_fee_in_cents' }) deliveryFeeInCents: number;
  @Column('int', { name: 'total_in_cents' }) totalInCents: number;
  @Column({ default: 'PENDING' }) status: string;
  @Column({ name: 'gateway_transaction_id', type: 'varchar', nullable: true }) gatewayTransactionId: string | null;
  @Column({ name: 'card_brand', type: 'varchar', nullable: true }) cardBrand: string | null;
  @Column({ name: 'card_last_four', type: 'varchar', length: 4, nullable: true }) cardLastFour: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

@Entity('deliveries')
export class DeliveryEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @OneToOne(() => TransactionEntity, (t) => t.delivery, { nullable: false })
  @JoinColumn({ name: 'transaction_id' })
  transaction: TransactionEntity;
  @Column() address: string;
  @Column() city: string;
  @Column() region: string;
  @Column({ name: 'postal_code', type: 'varchar', nullable: true }) postalCode: string | null;
  @Column({ default: 'PENDING' }) status: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

export const ENTITIES = [ProductEntity, CustomerEntity, TransactionEntity, DeliveryEntity];
