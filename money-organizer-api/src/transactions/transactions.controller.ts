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
import { Request as ExpressRequest } from 'express';

interface AuthenticatedRequest extends ExpressRequest {
    user: {
        id: string;
        email: string;
    }
}

@UseGuards(AuthGuard('jwt'))
@Controller('transactions')
export class TransactionsController {
    constructor(private readonly transactionsService: TransactionsService) { }   

    @Post()
    create(
        @Request() req: AuthenticatedRequest,
        @Body() createTransactionDto: CreateTransactionDto
    ) {
        return this.transactionsService.create(req.user.id, createTransactionDto);
    }

    @Post('installments')
    createInstallment(
        @Request() req: AuthenticatedRequest,
        @Body() dto: CreateInstallmentsDto
    ) {
        return this.transactionsService.createInstallment(req.user.id, dto);
    }

    @Get()
    findAll(
        @Request() req: AuthenticatedRequest,
        @Query() filters: QueryTransactionsDto
    ) {
        return this.transactionsService.findAll(req.user.id, filters);
    }

    @Get('totals/by-category') // tem que vir antes pra não ser interpretado como ID
    getTotalsByCategory(
        @Request() req: AuthenticatedRequest,
        @Query() filters: QueryTransactionsDto
    ) {
            return this.transactionsService.getTotalsByCategory(req.user.id, filters);
    }

    @Get(':id') // transactions/x -> QUALQUER COISA AQUI! É ENTENDIDO COMO ID
    findOne(
        @Request() req: AuthenticatedRequest,
        @Param('id') id: string,
    ) {
        return this.transactionsService.findOne(req.user.id, id);
    }

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

    @Delete(':id')
    remove(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
        return this.transactionsService.remove(req.user.id, id);
    }
    

}
