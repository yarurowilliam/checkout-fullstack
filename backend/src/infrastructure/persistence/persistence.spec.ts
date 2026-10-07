import { Repository } from 'typeorm';
import { ProductEntity } from './entities';
import { ProductSeeder, SEED_PRODUCTS } from './seed';
import { TypeOrmProductRepository } from './typeorm-product.repository';

const mockRepo = () =>
  ({
    find: jest.fn(),
    findOneBy: jest.fn(),
    count: jest.fn(),
    insert: jest.fn(),
  }) as unknown as jest.Mocked<Repository<ProductEntity>>;

describe('TypeOrmProductRepository', () => {
  it('lista ordenado por nombre y busca por id', async () => {
    const repo = mockRepo();
    const adapter = new TypeOrmProductRepository(repo);
    await adapter.findAll();
    await adapter.findById('p1');
    expect(repo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
    expect(repo.findOneBy).toHaveBeenCalledWith({ id: 'p1' });
  });
});

describe('ProductSeeder', () => {
  it('inserta productos si la tabla está vacía', async () => {
    const repo = mockRepo();
    repo.count.mockResolvedValue(0);
    await new ProductSeeder(repo).onApplicationBootstrap();
    expect(repo.insert).toHaveBeenCalledWith(SEED_PRODUCTS);
  });

  it('no inserta si ya hay productos', async () => {
    const repo = mockRepo();
    repo.count.mockResolvedValue(3);
    await new ProductSeeder(repo).onApplicationBootstrap();
    expect(repo.insert).not.toHaveBeenCalled();
  });
});
