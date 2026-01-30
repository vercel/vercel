import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // init instead of listen to avoid waiting for server kill
  await app.init();
}

export default bootstrap();

