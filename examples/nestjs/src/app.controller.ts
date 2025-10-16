import { Controller, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Header('Content-Type', 'text/html')
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('/health')
  getHealth(): string {
    return 'OK';
  }

  @Get('/version')
  getVersion(): string {
    return '1.0.0';
  }
}
