import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { TraceMethodBoundary, logfmt } from '@sundial/protocol/logging';
import { CreateDistributionDto, CreateDistributionPsbtDto } from './dto.js';
import { ProvidersService } from './providers.service.js';

@ApiTags('providers')
@Controller('v1/providers')
@TraceMethodBoundary()
export class ProvidersController {
  private readonly logger = new Logger(ProvidersController.name);

  constructor(private readonly providersService: ProvidersService) {}

  @ApiOperation({ summary: 'Get active providers with their active programs' })
  @ApiOkResponse({
    description: 'Active providers and active programs',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          provider_id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          programs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                program_id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                description: { type: 'string', nullable: true },
                expected_yield_bps: { type: 'number' },
                min_lock_ms: { type: 'number' },
                program_vault_address: { type: 'string' },
              },
            },
          },
        },
      },
    },
  })
  @Get()
  async getProviders() {
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'ProvidersController.getProviders',
        outcome: 'start',
      }),
    );
    const response =
      await this.providersService.getActiveProvidersWithPrograms();
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'ProvidersController.getProviders',
        outcome: 'success',
        count: response.length,
      }),
    );
    return response;
  }

  @ApiOperation({ summary: 'Get claimable deposits for provider' })
  @ApiParam({
    name: 'providerId',
    description: 'Provider UUID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @ApiOkResponse({
    description: 'Provider claimable deposits',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          deposit_id: { type: 'string', format: 'uuid' },
          program_id: { type: 'string', format: 'uuid' },
          program_vault_address: { type: 'string' },
          amount_sats: { type: 'number' },
          alpha_bps: { type: 'number' },
          lock_ms: { type: 'number' },
          escrow_amount_sats: { type: 'number' },
          reserve_amount_sats: { type: 'number' },
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid providerId format' })
  @Get(':providerId/claimable')
  async getClaimable(
    @Param('providerId', new ParseUUIDPipe()) providerId: string,
  ) {
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'ProvidersController.getClaimable',
        outcome: 'start',
        providerId,
      }),
    );
    const response =
      await this.providersService.getClaimableForProvider(providerId);
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'ProvidersController.getClaimable',
        outcome: 'success',
        providerId,
        count: response.length,
      }),
    );
    return response;
  }

  @ApiOperation({ summary: 'Register FINAL distribution intent for provider' })
  @ApiBody({ type: CreateDistributionDto })
  @ApiCreatedResponse({
    description: 'Distribution intent created',
    schema: {
      type: 'object',
      properties: {
        distribution_id: { type: 'string', format: 'uuid' },
        provider_id: { type: 'string', format: 'uuid' },
        program_id: { type: 'string', format: 'uuid' },
        distribution_type: { type: 'string', enum: ['FINAL'] },
        status: { type: 'string', enum: ['INTENT_CREATED'] },
        payable_at: { type: 'string', format: 'date-time' },
        created_at: { type: 'string', format: 'date-time' },
        allocations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              distribution_allocation_id: { type: 'string', format: 'uuid' },
              distribution_id: { type: 'string', format: 'uuid' },
              deposit_id: { type: 'string', format: 'uuid' },
              destination_address: { type: 'string' },
              principal_return_sats: { type: 'number' },
              yield_sats: { type: 'number' },
              status: { type: 'string', enum: ['INTENT_CREATED'] },
              created_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid distribution request payload',
  })
  @Post('distributions/intent')
  async createDistributionIntent(@Body() dto: CreateDistributionDto) {
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'ProvidersController.createDistributionIntent',
        outcome: 'start',
        providerId: dto.provider_id,
        programId: dto.program_id,
        allocations: dto.allocations.length,
      }),
    );
    const response = await this.providersService.createDistribution(
      dto.provider_id,
      dto,
    );
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'ProvidersController.createDistributionIntent',
        outcome: 'success',
        distributionId: response.distribution_id,
      }),
    );
    return response;
  }

  @ApiOperation({
    summary:
      'Register FINAL distribution intent with externally built PSBT for provider',
  })
  @ApiBody({ type: CreateDistributionPsbtDto })
  @ApiCreatedResponse({
    description: 'Distribution intent created',
    schema: {
      type: 'object',
      properties: {
        distribution_id: { type: 'string', format: 'uuid' },
        provider_id: { type: 'string', format: 'uuid' },
        program_id: { type: 'string', format: 'uuid' },
        distribution_type: { type: 'string', enum: ['FINAL'] },
        status: { type: 'string', enum: ['INTENT_CREATED'] },
        payable_at: { type: 'string', format: 'date-time' },
        psbt_base64: { type: 'string' },
        created_at: { type: 'string', format: 'date-time' },
        allocations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              distribution_allocation_id: { type: 'string', format: 'uuid' },
              distribution_id: { type: 'string', format: 'uuid' },
              deposit_id: { type: 'string', format: 'uuid' },
              destination_address: { type: 'string' },
              principal_return_sats: { type: 'number' },
              yield_sats: { type: 'number' },
              status: { type: 'string', enum: ['INTENT_CREATED'] },
              created_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid distribution request payload',
  })
  @Post('distributions/intent-psbt')
  async createDistributionIntentPsbt(@Body() dto: CreateDistributionPsbtDto) {
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'ProvidersController.createDistributionIntentPsbt',
        outcome: 'start',
        providerId: dto.provider_id,
        programId: dto.program_id,
        allocations: dto.allocations.length,
      }),
    );
    const response = await this.providersService.createDistributionPsbt(
      dto.provider_id,
      dto,
    );
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'ProvidersController.createDistributionIntentPsbt',
        outcome: 'success',
        distributionId: response.distribution_id,
      }),
    );
    return response;
  }

  @ApiOperation({
    summary:
      'Get provider deposits due for FINAL distribution registration within N days',
  })
  @ApiParam({
    name: 'providerId',
    description: 'Provider UUID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @ApiQuery({
    name: 'within_days',
    required: true,
    type: Number,
    example: 7,
    description: 'Include deposits maturing on or before now + within_days',
  })
  @ApiOkResponse({
    description: 'Deposits due for provider distribution registration',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          deposit_id: { type: 'string', format: 'uuid' },
          program_id: { type: 'string', format: 'uuid' },
          user_beneficiary_address: { type: 'string' },
          principal_sats: { type: 'number' },
          due_at: { type: 'string', format: 'date-time', nullable: true },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid providerId or within_days',
  })
  @Get(':providerId/distributions/due')
  getDistributionDue(
    @Param('providerId', new ParseUUIDPipe()) providerId: string,
    @Query('within_days', ParseIntPipe) withinDays: number,
  ) {
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'ProvidersController.getDistributionDue',
        outcome: 'start',
        providerId,
        withinDays,
      }),
    );
    return this.providersService
      .getDistributionDue(providerId, withinDays)
      .then((response) => {
        this.logger.log(
          logfmt({
            event: 'flow',
            method: 'ProvidersController.getDistributionDue',
            outcome: 'success',
            providerId,
            count: response.length,
          }),
        );
        return response;
      });
  }

  @ApiOperation({ summary: 'Create a new provider' })
  @ApiBody({ schema: { type: 'object', properties: { name: { type: 'string' } } } })
  @ApiCreatedResponse({
    description: 'Provider created',
    schema: {
      type: 'object',
      properties: {
        provider_id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        is_active: { type: 'boolean' },
      },
    },
  })
  @Post()
  async createProvider(@Body('name') name: string) {
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'ProvidersController.createProvider',
        outcome: 'start',
        name,
      }),
    );
    const response = await this.providersService.createProvider(name);
    this.logger.log(
      logfmt({
        event: 'flow',
        method: 'ProvidersController.createProvider',
        outcome: 'success',
        providerId: response.provider_id,
      }),
    );
    return response;
  }
}
