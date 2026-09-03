import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { auth } from 'src/common/decorator/auth.decorator';
import { RoleEnum } from 'src/common/enums/userEnum';
import { QueryReportDto } from './dto/reports.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports & Analytics')
@ApiBearerAuth('JWT-auth')
@Controller('reports')
@auth({
  roles: [
    RoleEnum.admin,
    RoleEnum.superAdmin,
    RoleEnum.owner,
    RoleEnum.manager,
  ],
})
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Executive Reports Overview',
    description:
      'Retrieves high-level KPI cards and consolidated graphs spanning revenue, refunds, utilization, and deposits.',
  })
  @ApiResponse({ status: 200, description: 'Reports overview retrieved successfully' })
  async getReportsOverview(@Query() query: QueryReportDto) {
    const data = await this.reportsService.getReportsOverview(query);
    return {
      message: 'Reports overview retrieved successfully',
      data,
    };
  }

  @Get('revenue')
  @ApiOperation({
    summary: 'Revenue & Payments Report',
    description:
      'Generates gross vs net revenue, payment method breakdowns (cash vs card vs wallet), deposit splits, and card reconciliation.',
  })
  @ApiResponse({ status: 200, description: 'Revenue report retrieved successfully' })
  async getRevenueReport(@Query() query: QueryReportDto) {
    const data = await this.reportsService.getRevenueReport(query);
    return {
      message: 'Revenue report retrieved successfully',
      data,
    };
  }

  @Get('refunds-wallet')
  @ApiOperation({
    summary: 'Refunds & Wallet Liability Report',
    description:
      'Aggregates refund volume and rate over time, customer wallet balance liability, and wallet velocity audit ledger.',
  })
  @ApiResponse({ status: 200, description: 'Refunds and wallet report retrieved successfully' })
  async getRefundsAndWalletReport(@Query() query: QueryReportDto) {
    const data = await this.reportsService.getRefundsAndWalletReport(query);
    return {
      message: 'Refunds & wallet report retrieved successfully',
      data,
    };
  }

  @Get('no-shows')
  @ApiOperation({
    summary: 'No-Shows & Lost Revenue Report',
    description:
      'Calculates no-show rate per venue and per customer, and the financial revenue impact of unattended matches.',
  })
  @ApiResponse({ status: 200, description: 'No-shows report retrieved successfully' })
  async getNoShowsReport(@Query() query: QueryReportDto) {
    const data = await this.reportsService.getNoShowsReport(query);
    return {
      message: 'No-shows report retrieved successfully',
      data,
    };
  }

  @Get('coupons')
  @ApiOperation({
    summary: 'Coupons & Promos Report',
    description:
      'Analyzes coupon redemption rates, revenue driven vs discount granted, and new vs returning customer split.',
  })
  @ApiResponse({ status: 200, description: 'Coupons report retrieved successfully' })
  async getCouponsReport(@Query() query: QueryReportDto) {
    const data = await this.reportsService.getCouponsReport(query);
    return {
      message: 'Coupons report retrieved successfully',
      data,
    };
  }

  @Get('ads')
  @ApiOperation({
    summary: 'Ad System & Advertiser Report',
    description:
      'Evaluates ad revenue, advertiser spend, click-through rates (CTR), payment statuses, and banner position utilization.',
  })
  @ApiResponse({ status: 200, description: 'Ads report retrieved successfully' })
  async getAdsReport(@Query() query: QueryReportDto) {
    const data = await this.reportsService.getAdsReport(query);
    return {
      message: 'Ads report retrieved successfully',
      data,
    };
  }

  @Get('venue-utilization')
  @ApiOperation({
    summary: 'Venue & Pitch Utilization Report',
    description:
      'Computes court occupancy rates, 24-hour demand curves, and venue ranking by capacity performance.',
  })
  @ApiResponse({ status: 200, description: 'Venue utilization report retrieved successfully' })
  async getVenueUtilizationReport(@Query() query: QueryReportDto) {
    const data = await this.reportsService.getVenueUtilizationReport(query);
    return {
      message: 'Venue utilization report retrieved successfully',
      data,
    };
  }

  @Get('customers-funnel')
  @ApiOperation({
    summary: 'Customer Retention & Booking Funnel Report',
    description:
      'Tracks conversion through booking funnel stages and measures customer repeat booking frequency and LTV.',
  })
  @ApiResponse({ status: 200, description: 'Customers & funnel report retrieved successfully' })
  async getCustomersAndFunnelReport(@Query() query: QueryReportDto) {
    const data = await this.reportsService.getCustomersAndFunnelReport(query);
    return {
      message: 'Customers & funnel report retrieved successfully',
      data,
    };
  }

  @Get('payouts-disputes')
  @ApiOperation({
    summary: 'Venue Owner Payouts & Disputes Report',
    description:
      'Calculates platform commission fees owed to pitch owners, net payouts, and summarizes customer dispute inquiries.',
  })
  @ApiResponse({ status: 200, description: 'Payouts & disputes report retrieved successfully' })
  async getPayoutsAndDisputesReport(@Query() query: QueryReportDto) {
    const data = await this.reportsService.getPayoutsAndDisputesReport(query);
    return {
      message: 'Payouts & disputes report retrieved successfully',
      data,
    };
  }
}
