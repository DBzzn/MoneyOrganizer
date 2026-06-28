import { Test, TestingModule } from '@nestjs/testing';
import { StatementImportsController } from './statement-imports.controller';
import { StatementImportsService } from './statement-imports.service';

type AuthenticatedControllerRequest = Parameters<
  StatementImportsController['undoAppliedMovements']
>[0];

describe('StatementImportsController', () => {
  let controller: StatementImportsController;
  let service: {
    undoAppliedMovements: jest.Mock;
    updateBatch: jest.Mock;
  };

  const request = {
    user: {
      id: 'user-1',
      email: 'user@example.com',
    },
  } as AuthenticatedControllerRequest;

  beforeEach(async () => {
    service = {
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
      controller.undoAppliedMovements(request, 'batch-1', {
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
      controller.undoAppliedMovements(request, 'batch-1'),
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
      controller.updateBatch(request, 'batch-1', { name: 'Nubank maio' }),
    ).resolves.toBe(response);

    expect(service.updateBatch).toHaveBeenCalledWith('user-1', 'batch-1', {
      name: 'Nubank maio',
    });
  });
});
