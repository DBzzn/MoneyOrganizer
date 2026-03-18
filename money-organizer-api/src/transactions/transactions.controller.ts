import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    UseGuards,
    Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { CreateInstallmentsDto } from './dto/create-installments.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { ReportFiltersDto } from './dto/report-filters.dto';
import { Request as ExpressRequest } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

interface AuthenticatedRequest extends ExpressRequest {
    user: {
        id: string;
        email: string;
    }
}

@ApiTags('transactions')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('transactions')
export class TransactionsController {
    constructor(private readonly transactionsService: TransactionsService) { }   

    @ApiOperation({ summary: 'Criar nova transação' })
    @ApiResponse({ status: 201, description: 'Transação criada com sucesso' })
    @ApiResponse({ status: 400, description: 'Dados inválidos' })
    @ApiResponse({ status: 401, description: 'Não autenticado' })
    @ApiResponse({ status: 404, description: 'Categoria não encontrada' })
    @Post()
    create(
        @Request() req: AuthenticatedRequest,
        @Body() createTransactionDto: CreateTransactionDto
    ) {
        return this.transactionsService.create(req.user.id, createTransactionDto);
    }

    @ApiOperation({ summary: 'Criar parcelamento automático (gera N parcelas de uma vez)' })
    @ApiResponse({ status: 201, description: 'Parcelamento criado com sucesso' })
    @ApiResponse({ status: 400, description: 'Dados inválidos' })
    @ApiResponse({ status: 401, description: 'Não autenticado' })
    @ApiResponse({ status: 404, description: 'Categoria não encontrada' })
    @Post('installments')
    createInstallment(
        @Request() req: AuthenticatedRequest,
        @Body() dto: CreateInstallmentsDto
    ) {
        return this.transactionsService.createInstallment(req.user.id, dto);
    }

    @ApiOperation({ summary: 'Listar transações com filtros opcionais' })
    @ApiResponse({ status: 200, description: 'Lista de transações retornada com sucesso' })
    @ApiResponse({ status: 401, description: 'Não autenticado' })
    @Get()
    findAll(
        @Request() req: AuthenticatedRequest,
        @Query() filters: QueryTransactionsDto
    ) {
        return this.transactionsService.findAll(req.user.id, filters);
    }

    @ApiOperation({ summary: 'Obter totais agregados por categoria' })
    @ApiResponse({ status: 200, description: 'Totais por categoria retornados com sucesso' })
    @ApiResponse({ status: 401, description: 'Não autenticado' })
    @Get('totals/by-category') 
    getTotalsByCategory(
        @Request() req: AuthenticatedRequest,
        @Query() filters: QueryTransactionsDto
    ) {
            return this.transactionsService.getTotalsByCategory(req.user.id, filters);
    }

    @ApiOperation({ summary: 'Obter balanço mensal (receitas, despesas e saldo)' })
    @ApiResponse({ status: 200, description: 'Balanço mensal retornado com sucesso' })
    @ApiResponse({ status: 401, description: 'Não autenticado' })
    @Get('totals/monthly-balance')
    getMonthlyBalance(
        @Request() req: AuthenticatedRequest,
        @Query() filters: ReportFiltersDto,
    ) {
        return this.transactionsService.getMonthlyBalance(req.user.id, filters);
    }

    @ApiOperation({ summary: 'Obter evolução temporal (receitas e despesas ao longo dos meses)' })
    @ApiResponse({ status: 200, description: 'Evolução temporal retornada com sucesso' })
    @ApiResponse({ status: 401, description: 'Não autenticado' })
    @Get('reports/evolution')
    getEvolution(
        @Request() req: AuthenticatedRequest,
        @Query() filters: ReportFiltersDto,
    ) {
        return this.transactionsService.getEvolution(req.user.id, filters);
    }

    @ApiOperation({ summary: 'Obter projeção futura baseada em transações pendentes' })
    @ApiResponse({ status: 200, description: 'Projeção futura retornada com sucesso' })
    @ApiResponse({ status: 401, description: 'Não autenticado' })
    @Get('reports/projection')
    getProjection(
        @Request() req: AuthenticatedRequest,
        @Query() filters: ReportFiltersDto,
    ) {
        return this.transactionsService.getProjection(req.user.id, filters);
    }

    //Tudo que não for pra ser ID tem que vir antes daqui!
    @ApiOperation({ summary: 'Buscar transação específica por ID' })
    @ApiResponse({ status: 200, description: 'Transação retornada com sucesso' })
    @ApiResponse({ status: 401, description: 'Não autenticado' })
    @ApiResponse({ status: 404, description: 'Transação não encontrada ou não pertence ao usuário' })
    @Get(':id')
    findOne(
        @Request() req: AuthenticatedRequest,
        @Param('id') id: string,
    ) {
        return this.transactionsService.findOne(req.user.id, id);
    }

    @ApiOperation({ summary: 'Atualizar transação existente' })
    @ApiResponse({ status: 200, description: 'Transação atualizada com sucesso' })
    @ApiResponse({ status: 400, description: 'Dados inválidos' })
    @ApiResponse({ status: 401, description: 'Não autenticado' })
    @ApiResponse({ status: 404, description: 'Transação não encontrada ou não pertence ao usuário' })
    @Patch(':id')
    update(
        @Request() req: AuthenticatedRequest,
        @Param('id') id: string,
        @Body() updateTransactionDto: UpdateTransactionDto
    ) {
        return this.transactionsService.update(
            req.user.id,
            id,
            updateTransactionDto
        );
    }

    @ApiOperation({ summary: 'Remover transação' })
    @ApiResponse({ status: 200, description: 'Transação removida com sucesso' })
    @ApiResponse({ status: 401, description: 'Não autenticado' })
    @ApiResponse({ status: 404, description: 'Transação não encontrada ou não pertence ao usuário' })
    @Delete(':id')
    remove(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
        return this.transactionsService.remove(req.user.id, id);
    }
    

}
