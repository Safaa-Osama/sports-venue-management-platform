import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AdminUserRepo } from './common/repositories/admin-user-repo';
import { RoleEnum } from './common/enums/userEnum';
import * as bcrypt from 'bcrypt';

async function seedSuperAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const adminUserRepo = app.get(AdminUserRepo);

  const adminEmail = process.env.INITIAL_ADMIN_EMAIL || 'admin@venue.com';
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'Admin@123456';

  const existing = await adminUserRepo.findOne({
    filter: { email: adminEmail },
  });

  if (existing) {
    console.log(`[Seed] Super Admin already exists with email: ${adminEmail}`);
  } else {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await adminUserRepo.create({
      userName: 'Super Admin',
      email: adminEmail,
      password: hashedPassword,
      role: RoleEnum.superAdmin,
    });
    console.log(
      `[Seed] Successfully created Super Admin: ${adminEmail} (password: ${adminPassword})`,
    );
  }

  await app.close();
}

seedSuperAdmin().catch((err) => {
  console.error('[Seed Error]', err);
  process.exit(1);
});
