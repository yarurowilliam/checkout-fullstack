import { createSlice } from '@reduxjs/toolkit';
import type { Product } from '../domain/types';
import { createAppThunk } from './thunk';

interface ProductsState {
  items: Product[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
}

const initialState: ProductsState = { items: [], status: 'idle', error: null };

export const fetchProducts = createAppThunk('products/fetch', (_: void, { extra }) => extra.backend.products());

const productsSlice = createSlice({
  name: 'products',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.status = 'ready';
        state.items = action.payload;
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.error.message ?? 'No se pudieron cargar los productos';
      });
  },
});

export default productsSlice.reducer;
