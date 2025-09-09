import type Client from '../client';

/**
 * Interface for refund action request body
 */
export interface RefundActionRequest {
  action: 'refund';
  total: string;
  reason?: string;
}

/**
 * Interface for refund action response
 */
export interface RefundActionResponse {
  success: boolean;
  status: number;
  message?: string;
}

/**
 * Creates a refund action for a marketplace invoice
 * 
 * @param client - Vercel API client
 * @param integrationConfigurationId - The integration configuration ID
 * @param invoiceId - The invoice ID to refund
 * @param amount - The refund amount as a string (e.g., "25.00")
 * @param reason - Optional reason for the refund
 * @returns Promise<RefundActionResponse>
 */
export async function refundInvoice(
  client: Client,
  integrationConfigurationId: string,
  invoiceId: string,
  amount: string,
  reason?: string
): Promise<RefundActionResponse> {
  try {
    await client.fetch<void>(
      `/v1/installations/${integrationConfigurationId}/billing/invoices/${invoiceId}/actions`,
      {
        method: 'POST',
        json: true,
        body: {
          action: 'refund',
          total: amount,
          reason: reason || 'Marketplace refund'
        },
      }
    );

    return {
      success: true,
      status: 204,
      message: 'Refund action created successfully'
    };
  } catch (error: any) {
    return {
      success: false,
      status: error.status || 500,
      message: error.message || 'Failed to create refund action'
    };
  }
}

/**
 * Validates refund parameters before making the API call
 */
export function validateRefundParams(
  integrationConfigurationId: string,
  invoiceId: string,
  amount: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!integrationConfigurationId || !integrationConfigurationId.trim()) {
    errors.push('Integration configuration ID is required');
  }

  if (!invoiceId || !invoiceId.trim()) {
    errors.push('Invoice ID is required');
  }

  if (!amount || !amount.trim()) {
    errors.push('Refund amount is required');
  } else {
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      errors.push('Refund amount must be a positive number');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Example usage function demonstrating the refund API call
 */
export async function exampleRefundUsage(client: Client): Promise<void> {
  const integrationConfigurationId = 'icfg_example123';
  const invoiceId = 'inv_example456';
  const refundAmount = '25.00';
  const reason = 'Customer refund request';

  const validation = validateRefundParams(integrationConfigurationId, invoiceId, refundAmount);
  if (!validation.valid) {
    console.error('Validation errors:', validation.errors);
    return;
  }

  try {
    console.log(`Creating refund for invoice ${invoiceId} - Amount: $${refundAmount}`);
    
    const result = await refundInvoice(
      client,
      integrationConfigurationId,
      invoiceId,
      refundAmount,
      reason
    );

    if (result.success) {
      console.log('✅ Refund created successfully');
    } else {
      console.error('❌ Refund failed:', result.message);
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}
