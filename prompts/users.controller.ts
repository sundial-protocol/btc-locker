import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ParseBitcoinAddressPipe } from '@sundial/bitcoin/locker';
import { TraceMethodBoundary, logfmt } from '@sundial/protocol/logging';
import { CreateDepositIntentDto, CreateDepositIntentPsbtDto } from './dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@Controller('v1/users')
@TraceMethodBoundary()
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Create deposit record' })
  @ApiBody({ type: CreateDepositIntentDto })
  @ApiCreatedResponse({
    description: 'Deposit created',
    schema: {
      type: 'object',
      properties: {
        deposit_id: { type: 'string', format: 'uuid' },
        status: { type: 'string' },
        provider_id: { type: 'string', format: 'uuid' },
        program_id: { type: 'string', format: 'uuid' },
        amount_sats: { type: 'number' },
        alpha_bps: { type: 'number' },
        lock_ms: { type: 'number' },
        psbt_base64: { type: 'string' },
        network: { type: 'string' },
        created_at: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  @Post('deposits/intent')
  async createIntent(@Body() dto: CreateDepositIntentDto) {
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'UsersController.createIntent',
        outcome: 'start',
        providerId: dto.provider_id,
        programId: dto.program_id,
      }),
    );
    const response = await this.usersService.createIntent(dto);
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'UsersController.createIntent',
        outcome: 'success',
        depositId: response.deposit_id,
      }),
    );
    return response;
  }

  @ApiOperation({ summary: 'Create deposit record with prebuilt PSBT' })
  @ApiBody({ type: CreateDepositIntentPsbtDto })
  @ApiCreatedResponse({
    description: 'Deposit created',
    schema: {
      type: 'object',
      properties: {
        deposit_id: { type: 'string', format: 'uuid' },
        status: { type: 'string' },
        provider_id: { type: 'string', format: 'uuid' },
        program_id: { type: 'string', format: 'uuid' },
        amount_sats: { type: 'number' },
        alpha_bps: { type: 'number' },
        lock_ms: { type: 'number' },
        psbt_base64: { type: 'string' },
        network: { type: 'string' },
        created_at: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  @Post('deposits/intent-psbt')
  async createIntentPsbt(@Body() dto: CreateDepositIntentPsbtDto) {
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'UsersController.createIntentPsbt',
        outcome: 'start',
        providerId: dto.provider_id,
        programId: dto.program_id,
      }),
    );
    const response = await this.usersService.createIntentPsbt(dto);
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'UsersController.createIntentPsbt',
        outcome: 'success',
        depositId: response.deposit_id,
      }),
    );
    return response;
  }

  @ApiOperation({ summary: 'Get a single deposit by deposit id' })
  @ApiParam({
    name: 'deposit_id',
    description: 'Deposit UUID',
    example: '770e8400-e29b-41d4-a716-446655440001',
  })
  @ApiOkResponse({
    description: 'Deposit found',
    schema: {
      type: 'object',
      properties: {
        deposit_id: { type: 'string', format: 'uuid' },
        user_beneficiary_address: { type: 'string' },
        status: { type: 'string' },
        provider_id: { type: 'string', format: 'uuid' },
        program_id: { type: 'string', format: 'uuid' },
        amount_sats: { type: 'number' },
        alpha_bps: { type: 'number' },
        lock_ms: { type: 'number' },
        due_at: { type: 'string', format: 'date-time', nullable: true },
        created_at: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Deposit not found or invalid deposit id',
  })
  @Get('deposits/intent/:deposit_id')
  async getIntentByDepositId(
    @Param('deposit_id', new ParseUUIDPipe()) depositId: string,
  ) {
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'UsersController.getIntentByDepositId',
        outcome: 'start',
        depositId,
      }),
    );
    const response = await this.usersService.getIntentByDepositId(depositId);
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'UsersController.getIntentByDepositId',
        outcome: 'success',
        depositId: response.deposit_id,
      }),
    );
    return response;
  }

  @ApiOperation({
    summary: 'Get all deposits for a beneficiary address',
  })
  @ApiParam({
    name: 'user_beneficiary_address',
    description: 'Bitcoin beneficiary address',
    example: 'tb1qar0srrr7xfkvy5l643lydnw9re59gtzzwf7j2a',
  })
  @ApiOkResponse({
    description: 'Deposits for beneficiary',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          deposit_id: { type: 'string', format: 'uuid' },
          user_beneficiary_address: { type: 'string' },
          status: { type: 'string' },
          provider_id: { type: 'string', format: 'uuid' },
          program_id: { type: 'string', format: 'uuid' },
          amount_sats: { type: 'number' },
          alpha_bps: { type: 'number' },
          lock_ms: { type: 'number' },
          due_at: { type: 'string', format: 'date-time', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid beneficiary address parameter',
  })
  @Get('deposits/intents/:user_beneficiary_address')
  async getIntentsForUser(
    @Param(
      'user_beneficiary_address',
      new ParseBitcoinAddressPipe('user_beneficiary_address'),
    )
    userBeneficiaryAddress: string,
  ) {
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'UsersController.getIntentsForUser',
        outcome: 'start',
        beneficiaryAddress: userBeneficiaryAddress,
      }),
    );
    const response = await this.usersService.getIntentsForUser(
      userBeneficiaryAddress,
    );
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'UsersController.getIntentsForUser',
        outcome: 'success',
        count: response.length,
      }),
    );
    return response;
  }

  @ApiOperation({
    summary: 'Get claimable user returns for beneficiary address',
  })
  @ApiParam({
    name: 'beneficiary_address',
    description: 'Bitcoin beneficiary address',
    example: 'tb1qar0srrr7xfkvy5l643lydnw9re59gtzzwf7j2a',
  })
  @ApiOkResponse({
    description: 'Claimable returns for user beneficiary address',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          distribution_allocation_id: { type: 'string', format: 'uuid' },
          distribution_id: { type: 'string', format: 'uuid' },
          deposit_id: { type: 'string', format: 'uuid' },
          provider_id: { type: 'string', format: 'uuid' },
          program_id: { type: 'string', format: 'uuid' },
          status: { type: 'string' },
          principal_return_sats: { type: 'number' },
          yield_sats: { type: 'number' },
          total_return_sats: { type: 'number' },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid beneficiary address parameter',
  })
  @Get(':beneficiary_address/claimable')
  async getClaimable(
    @Param(
      'beneficiary_address',
      new ParseBitcoinAddressPipe('beneficiary_address'),
    )
    beneficiaryAddress: string,
  ) {
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'UsersController.getClaimable',
        outcome: 'start',
        beneficiaryAddress,
      }),
    );
    const response =
      await this.usersService.getClaimableForUser(beneficiaryAddress);
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'UsersController.getClaimable',
        outcome: 'success',
        count: response.length,
      }),
    );
    return response;
  }
}
