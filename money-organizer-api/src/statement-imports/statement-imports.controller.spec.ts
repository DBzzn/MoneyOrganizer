import { Test, TestingModule } from '@nestjs/testing';
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import supertest from 'supertest';
import { StatementImportsController } from './statement-imports.controller';
import { StatementImportsService } from './statement-imports.service';

type AuthenticatedControllerRequest = Parameters<
  StatementImportsController['undoAppliedMovements']
>[0];

describe('StatementImportsController', () => {
  let controller: StatementImportsController;
  let app: INestApplication | undefined;
  let service: {
    preview: jest.Mock;
    createBatch: jest.Mock;
    undoAppliedMovements: jest.Mock;
    updateBatch: jest.Mock;
  };

  const controllerRequest = {
    user: {
      id: 'user-1',
      email: 'user@example.com',
    },
  } as AuthenticatedControllerRequest;

  beforeEach(async () => {
    service = {
      preview: jest.fn(),
      createBatch: jest.fn(),
      undoAppliedMovements: jest.fn(),
      updateBatch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatementImportsController],
      providers: [
        {
          provide: StatementImportsService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<StatementImportsController>(
      StatementImportsController,
    );
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes selected movement IDs when undoing applied imported movements', async () => {
    const response = {
      undoneCount: 2,
      transactionCount: 1,
      transferCount: 1,
    };
    service.undoAppliedMovements.mockResolvedValue(response);

    await expect(
      controller.undoAppliedMovements(controllerRequest, 'batch-1', {
        movementIds: ['movement-1', 'movement-2'],
      }),
    ).resolves.toBe(response);

    expect(service.undoAppliedMovements).toHaveBeenCalledWith(
      'user-1',
      'batch-1',
      ['movement-1', 'movement-2'],
    );
  });

  it('omits movement IDs when undoing all applied imported movements in the batch', async () => {
    const response = {
      undoneCount: 3,
      transactionCount: 2,
      transferCount: 1,
    };
    service.undoAppliedMovements.mockResolvedValue(response);

    await expect(
      controller.undoAppliedMovements(controllerRequest, 'batch-1'),
    ).resolves.toBe(response);

    expect(service.undoAppliedMovements).toHaveBeenCalledWith(
      'user-1',
      'batch-1',
      undefined,
    );
  });

  it('passes batch rename payload scoped to the authenticated user', async () => {
    const response = {
      id: 'batch-1',
      name: 'Nubank maio',
    };
    service.updateBatch.mockResolvedValue(response);

    await expect(
      controller.updateBatch(controllerRequest, 'batch-1', {
        name: 'Nubank maio',
      }),
    ).resolves.toBe(response);

    expect(service.updateBatch).toHaveBeenCalledWith('user-1', 'batch-1', {
      name: 'Nubank maio',
    });
  });

  async function createHttpApp() {
    const authGuard: CanActivate = {
      canActivate(context: ExecutionContext) {
        const httpRequest = context.switchToHttp().getRequest();
        httpRequest.user = controllerRequest.user;
        return true;
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatementImportsController],
      providers: [
        {
          provide: StatementImportsService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue(authGuard)
      .compile();

    app = module.createNestApplication();
    await app.init();
    return app;
  }

  it('accepts a multipart preview upload with simple form fields', async () => {
    service.preview.mockResolvedValue({ ok: true });
    const httpApp = await createHttpApp();

    await supertest(httpApp.getHttpServer())
      .post('/statement-imports/preview')
      .field('financialAccountId', 'account-1')
      .attach('file', Buffer.from('date,description,amount\n'), {
        filename: 'nu.csv',
        contentType: 'text/csv',
      })
      .expect(201)
      .expect({ ok: true });

    expect(service.preview).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        originalname: 'nu.csv',
        mimetype: 'text/csv',
        buffer: expect.any(Buffer),
      }),
      'account-1',
    );
  });

  it('accepts a multipart batch upload with multiple files', async () => {
    service.createBatch.mockResolvedValue({ id: 'batch-1' });
    const httpApp = await createHttpApp();

    await supertest(httpApp.getHttpServer())
      .post('/statement-imports/batches')
      .field('financialAccountId', 'account-1')
      .attach('files', Buffer.from('one'), {
        filename: 'nu-1.csv',
        contentType: 'text/csv',
      })
      .attach('files', Buffer.from('two'), {
        filename: 'nu-2.csv',
        contentType: 'text/csv',
      })
      .expect(201)
      .expect({ id: 'batch-1' });

    expect(service.createBatch).toHaveBeenCalledWith(
      'user-1',
      [
        expect.objectContaining({ originalname: 'nu-1.csv' }),
        expect.objectContaining({ originalname: 'nu-2.csv' }),
      ],
      'account-1',
    );
  });

  it('rejects nested multipart field names before calling the service', async () => {
    service.preview.mockResolvedValue({ ok: true });
    const httpApp = await createHttpApp();

    await supertest(httpApp.getHttpServer())
      .post('/statement-imports/preview')
      .field('financialAccountId[nested]', 'account-1')
      .attach('file', Buffer.from('date,description,amount\n'), {
        filename: 'nu.csv',
        contentType: 'text/csv',
      })
      .expect(400);

    expect(service.preview).not.toHaveBeenCalled();
  });
});
