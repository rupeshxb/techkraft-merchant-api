import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';

export const typeOrmOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  synchronize: false,
};

// Used by the TypeORM CLI (migration:* scripts) and the seeder.
export default new DataSource(typeOrmOptions);
