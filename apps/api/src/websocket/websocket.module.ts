import { Module } from '@nestjs/common';
import { TaskforgeGateway } from './taskforge.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [TaskforgeGateway],
  exports: [TaskforgeGateway],
})
export class WebsocketModule {}
