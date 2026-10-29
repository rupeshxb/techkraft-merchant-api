import * as bcrypt from 'bcrypt';
import dataSource from '../config/typeorm.config';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/enums/role.enum';

const BCRYPT_ROUNDS = 10;

const SEED_USERS = [
  { email: 'admin@techkraft.com', password: 'Admin@123', role: Role.ADMIN, firstName: 'Admin', lastName: 'User' },
  { email: 'reviewer@techkraft.com', password: 'Reviewer@123', role: Role.REVIEWER, firstName: 'John', lastName: 'Reviewer' },
  { email: 'sales@techkraft.com', password: 'Sales@123', role: Role.SALES, firstName: 'Jane', lastName: 'Sales' },
  { email: 'sales2@techkraft.com', password: 'Sales@123', role: Role.SALES, firstName: 'Bob', lastName: 'Sales' },
];

async function seed() {
  await dataSource.initialize();
  await dataSource.runMigrations();
  const repo = dataSource.getRepository(User);

  for (const { password, ...rest } of SEED_USERS) {
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const existing = await repo.findOne({ where: { email: rest.email } });
    if (existing) {
      await repo.update(existing.id, { ...rest, password: hashed });
      console.log(`Updated ${rest.email}`);
    } else {
      await repo.save(repo.create({ ...rest, password: hashed }));
      console.log(`Created ${rest.email}`);
    }
  }
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });
