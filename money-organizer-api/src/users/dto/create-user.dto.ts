import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class CreateUserDto {
    @ApiProperty({
        description: 'Nome completo do usuário',
        example: 'João Silva',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Email do usuário (único)',
        example: 'joao.silva@email.com',
    })
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiProperty({
        description: 'Senha do usuário (mínimo 6 caracteres)',
        example: 'senha123',
        minLength: 6,
    })
    @IsString()
    @MinLength(6)
    @IsNotEmpty()
    password: string;
}