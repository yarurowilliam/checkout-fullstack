import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { backend } from '../api/backend';
import { gateway } from '../api/gateway';
import checkout from './checkoutSlice';
import { loadCheckout, saveCheckout } from './persistence';
import products from './productsSlice';
import type { ThunkExtra } from './thunk';

export const createStore = (extra: ThunkExtra = { backend, gateway }, storage?: Storage) => {
  const store = configureStore({
    reducer: { products, checkout },
    preloadedState: { checkout: loadCheckout(storage) },
    middleware: (getDefault) => getDefault({ thunk: { extraArgument: extra } }),
  });
  store.subscribe(() => saveCheckout(store.getState().checkout, storage));
  return store;
};

export type AppStore = ReturnType<typeof createStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
