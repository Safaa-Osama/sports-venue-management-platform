import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({
    summary: 'Health Check / Welcome',
    description: 'Basic health check and root welcome ping.',
  })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  getHello(): string {
    return this.appService.getHello();
  }
}
