/**
 * Mock Refund Action for Vercel Marketplace API
 * 
 * This demonstrates how to create a refund action for $25.00 using the
 * Vercel Marketplace REST API endpoint:
 * POST /v1/installations/{integrationConfigurationId}/billing/invoices/{invoiceId}/actions
 */

const EXAMPLE_INTEGRATION_CONFIGURATION_ID = 'icfg_1234567890abcdef';
const EXAMPLE_INVOICE_ID = 'inv_abcdef1234567890';
const REFUND_AMOUNT = '25.00';

/**
 * Creates a refund action for a marketplace invoice
 * @param {string} integrationConfigurationId - The integration configuration ID
 * @param {string} invoiceId - The invoice ID to refund
 * @param {string} amount - The refund amount (e.g., "25.00")
 * @param {string} reason - Optional reason for the refund
 * @param {string} authToken - OAuth2 integration token
 * @returns {Promise<Object>} The API response
 */
async function createRefundAction(integrationConfigurationId, invoiceId, amount, reason = '', authToken) {
  const url = `https://api.vercel.com/v1/installations/${integrationConfigurationId}/billing/invoices/${invoiceId}/actions`;
  
  const requestBody = {
    action: 'refund',
    total: amount,
    reason: reason || 'Customer refund request'
  };

  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json',
    'User-Agent': 'vercel-marketplace-integration/1.0.0'
  };

  try {
    console.log(`Creating refund action for invoice ${invoiceId}`);
    console.log(`Refund amount: $${amount}`);
    console.log(`Request URL: ${url}`);
    console.log(`Request body:`, JSON.stringify(requestBody, null, 2));
    
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorData}`);
    }

    if (response.status === 204) {
      console.log('✅ Refund action created successfully');
      return { success: true, status: 204 };
    }

    const responseData = await response.json();
    console.log('✅ Refund action response:', responseData);
    return responseData;

  } catch (error) {
    console.error('❌ Failed to create refund action:', error.message);
    throw error;
  }
}

/**
 * Mock function to simulate the refund action call
 * This demonstrates the API call without making actual HTTP requests
 */
function mockRefundAction() {
  console.log('=== Mock Refund Action Demo ===\n');
  
  const mockRequest = {
    url: `https://api.vercel.com/v1/installations/${EXAMPLE_INTEGRATION_CONFIGURATION_ID}/billing/invoices/${EXAMPLE_INVOICE_ID}/actions`,
    method: 'POST',
    headers: {
      'Authorization': 'Bearer [OAUTH2_TOKEN]',
      'Content-Type': 'application/json',
      'User-Agent': 'vercel-marketplace-integration/1.0.0'
    },
    body: {
      action: 'refund',
      total: REFUND_AMOUNT,
      reason: 'Customer refund request'
    }
  };

  console.log('📋 Request Details:');
  console.log(`URL: ${mockRequest.url}`);
  console.log(`Method: ${mockRequest.method}`);
  console.log('\n📋 Headers:');
  Object.entries(mockRequest.headers).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });
  console.log('\n📋 Request Body:');
  console.log(JSON.stringify(mockRequest.body, null, 2));
  
  console.log('\n📋 Expected Response:');
  console.log('Status: 204 No Content');
  console.log('Body: (empty)');
  
  console.log('\n✅ Mock refund action for $25.00 completed successfully');
  
  return mockRequest;
}

/**
 * Error handling examples for common scenarios
 */
function demonstrateErrorHandling() {
  console.log('\n=== Error Handling Examples ===\n');
  
  const errorScenarios = [
    {
      status: 400,
      error: 'Bad Request',
      description: 'Invalid request body or missing required fields',
      example: { error: 'Invalid action type', code: 'INVALID_ACTION' }
    },
    {
      status: 401,
      error: 'Unauthorized',
      description: 'Invalid or missing OAuth2 token',
      example: { error: 'Invalid token', code: 'UNAUTHORIZED' }
    },
    {
      status: 403,
      error: 'Forbidden',
      description: 'Insufficient permissions for this integration',
      example: { error: 'Insufficient permissions', code: 'FORBIDDEN' }
    },
    {
      status: 404,
      error: 'Not Found',
      description: 'Invoice or integration configuration not found',
      example: { error: 'Invoice not found', code: 'INVOICE_NOT_FOUND' }
    },
    {
      status: 409,
      error: 'Conflict',
      description: 'Invoice already refunded or in invalid state',
      example: { error: 'Invoice already refunded', code: 'ALREADY_REFUNDED' }
    }
  ];

  errorScenarios.forEach(scenario => {
    console.log(`❌ ${scenario.status} ${scenario.error}`);
    console.log(`   Description: ${scenario.description}`);
    console.log(`   Example response: ${JSON.stringify(scenario.example)}\n`);
  });
}

/**
 * Integration with Vercel CLI patterns
 * Based on the existing marketplace integration utilities
 */
function integrateWithVercelCLI() {
  console.log('\n=== Integration with Vercel CLI ===\n');
  
  console.log('This refund action can be integrated with existing Vercel CLI utilities:');
  console.log('- fetch-marketplace-integrations.ts: Get integration configurations');
  console.log('- create-authorization.ts: Handle billing authorization flow');
  console.log('- types.ts: Use MarketplaceBillingAuthorizationState interface');
  
  console.log('\nExample CLI command structure:');
  console.log('vercel integration refund --invoice inv_123 --amount 25.00 --reason "Customer request"');
}

if (require.main === module) {
  mockRefundAction();
  demonstrateErrorHandling();
  integrateWithVercelCLI();
}

module.exports = {
  createRefundAction,
  mockRefundAction,
  demonstrateErrorHandling,
  integrateWithVercelCLI
};
