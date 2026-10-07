import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, Result } from '../../shared/result';

const STATUS: Record<ErrorCode, HttpStatus> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  VALIDATION: HttpStatus.BAD_REQUEST,
  OUT_OF_STOCK: HttpStatus.CONFLICT,
  CONFLICT: HttpStatus.CONFLICT,
  GATEWAY: HttpStatus.BAD_GATEWAY,
};

// Final del riel: convierte un Err en la respuesta HTTP correspondiente.
export const unwrap = <T>(result: Result<T>): T => {
  if (result.ok) return result.value;
  throw new HttpException({ code: result.error.code, message: result.error.message }, STATUS[result.error.code]);
};
