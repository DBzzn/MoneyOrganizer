import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ConfirmUserPasswordDto {
  @ApiProperty({
    description: 'Senha atual do usuário para confirmar a ação',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
