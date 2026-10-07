import { randomUUID } from 'crypto';
import { DataType, newDb } from 'pg-mem';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ENTITIES } from '../infrastructure/persistence/entities';

/** PostgreSQL en memoria para pruebas: mismo esquema y SQL que en producción. */
export const createMemoryDataSource = async (options: Partial<DataSourceOptions> = {}): Promise<DataSource> => {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({ name: 'current_database', implementation: () => 'test' });
  db.public.registerFunction({ name: 'version', implementation: () => 'PostgreSQL 16' });
  db.registerExtension('uuid-ossp', (schema) =>
    schema.registerFunction({ name: 'uuid_generate_v4', returns: DataType.uuid, implementation: randomUUID, impure: true }),
  );
  const ds: DataSource = db.adapters.createTypeormDataSource({ type: 'postgres', entities: ENTITIES, ...options });
  await ds.initialize();
  await ds.synchronize();
  return ds;
};
