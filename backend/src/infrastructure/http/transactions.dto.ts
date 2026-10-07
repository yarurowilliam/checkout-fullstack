import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CustomerDto {
  @IsEmail() @Length(5, 120) email: string;
  @IsString() @Length(3, 100) fullName: string;
  @Matches(/^\+?\d{7,15}$/, { message: 'phone debe tener entre 7 y 15 dígitos' }) phone: string;
}

export class DeliveryDto {
  @IsString() @Length(5, 150) address: string;
  @IsString() @Length(2, 60) city: string;
  @IsString() @Length(2, 60) region: string;
  @IsOptional() @Matches(/^\d{6}$/, { message: 'postalCode debe tener 6 dígitos' }) postalCode?: string;
}

export class CreateTransactionDto {
  @IsUUID() productId: string;
  @IsInt() @Min(1) @Max(10) quantity: number;
  @ValidateNested() @Type(() => CustomerDto) customer: CustomerDto;
  @ValidateNested() @Type(() => DeliveryDto) delivery: DeliveryDto;
}

export class PayTransactionDto {
  @Matches(/^tok_[A-Za-z0-9_]+$/, { message: 'cardToken inválido' }) cardToken: string;
  @IsInt() @Min(1) @Max(36) installments: number;
  @IsString() @Length(20, 2000) acceptanceToken: string;
  @IsString() @Length(20, 2000) acceptPersonalAuth: string;
}
