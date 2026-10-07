import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TransactionsUseCases } from '../../application/transactions.use-cases';
import { Fees, Transaction } from '../../domain/transaction';
import { Result } from '../../shared/result';
import { unwrap } from './http-result';
import { CreateTransactionDto, PayTransactionDto } from './transactions.dto';

// No se exponen el id interno ni el teléfono del cliente.
const toView = ({ customer, ...tx }: Transaction) => ({
  ...tx,
  customer: { fullName: customer.fullName, email: customer.email },
});

const respond = async (result: Promise<Result<Transaction>>) => toView(unwrap(await result));

@ApiTags('transactions')
@Controller()
export class TransactionsController {
  constructor(private readonly useCases: TransactionsUseCases) {}

  @Get('checkout/fees')
  fees(): Fees {
    return this.useCases.fees();
  }

  @Post('transactions')
  create(@Body() dto: CreateTransactionDto) {
    return respond(this.useCases.create(dto));
  }

  @Get('transactions/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return respond(this.useCases.get(id));
  }

  @Post('transactions/:id/payment')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayTransactionDto) {
    return respond(this.useCases.pay(id, dto));
  }
}
