import { createAsyncThunk } from '@reduxjs/toolkit';
import type { backend } from '../api/backend';
import type { gateway } from '../api/gateway';

// Los thunks reciben los adaptadores HTTP como dependencia (se reemplazan en los tests).
export interface ThunkExtra {
  backend: typeof backend;
  gateway: typeof gateway;
}

export interface ThunkState {
  checkout: import('./checkoutSlice').CheckoutState;
}

export const createAppThunk = createAsyncThunk.withTypes<{ extra: ThunkExtra; state: ThunkState }>();
