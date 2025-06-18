import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import list from '../../../../src/commands/blob/list';
import * as blobModule from '@vercel/blob';
import * as getBlobRWTokenModule from '../../../../src/util/blob/token';
import output from '../../../../src/output-manager';
import table from '../../../../src/util/output/table';

// Mock the external dependencies
vi.mock('@vercel/blob');
vi.mock('../../../../src/util/blob/token');
vi.mock('../../../../src/output-manager');
vi.mock('../../../../src/util/output/table');

const mockedBlob = vi.mocked(blobModule);
const mockedGetBlobRWToken = vi.mocked(getBlobRWTokenModule.getBlobRWToken);
const mockedOutput = vi.mocked(output);
const mockedTable = vi.mocked(table);

describe('blob list', () => {
  const testToken = 'vercel_blob_rw_test_token_123';

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();

    // Default successful mocks
    mockedGetBlobRWToken.mockResolvedValue({
      token: testToken,
      success: true,
    });
    mockedBlob.list.mockResolvedValue({
      blobs: [
        {
          url: 'https://example.com/file1.txt',
          downloadUrl: 'https://example.com/file1.txt',
          pathname: 'file1.txt',
          size: 1024,
          uploadedAt: new Date('2023-01-01T12:00:00Z'),
        },
        {
          url: 'https://example.com/file2.jpg',
          downloadUrl: 'https://example.com/file2.jpg',
          pathname: 'folder/file2.jpg',
          size: 2048,
          uploadedAt: new Date('2023-01-02T12:00:00Z'),
        },
      ],
      cursor: undefined,
      hasMore: false,
    });

    mockedTable.mockReturnValue('mocked table output');
  });

  describe('successful listing', () => {
    it('should list blobs with default options', async () => {
      client.setArgv('blob', 'list');

      const exitCode = await list(client, [], testToken);

      expect(exitCode).toBe(0);
      expect(mockedBlob.list).toHaveBeenCalledWith({
        token: testToken,
        limit: 10,
        cursor: undefined,
        mode: 'expanded',
        prefix: undefined,
      });
      expect(mockedOutput.debug).toHaveBeenCalledWith('Fetching blobs');
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Fetching blobs');
      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
      expect(mockedOutput.print).toHaveBeenCalledWith(
        '\n  mocked table output\n\n'
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([]);
    });

    it('should list blobs with all options provided', async () => {
      client.setArgv(
        'blob',
        'list',
        '--limit',
        '20',
        '--cursor',
        'cursor_123',
        '--prefix',
        'folder/',
        '--mode',
        'folded'
      );

      const exitCode = await list(
        client,
        [
          '--limit',
          '20',
          '--cursor',
          'cursor_123',
          '--prefix',
          'folder/',
          '--mode',
          'folded',
        ],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.list).toHaveBeenCalledWith({
        token: testToken,
        limit: 20,
        cursor: 'cursor_123',
        mode: 'folded',
        prefix: 'folder/',
      });

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:limit',
          value: '20',
        },
        {
          key: 'option:cursor',
          value: 'cursor_123',
        },
        {
          key: 'option:prefix',
          value: '[REDACTED]',
        },
        {
          key: 'option:mode',
          value: 'folded',
        },
      ]);
    });

    it('should handle expanded mode explicitly', async () => {
      const exitCode = await list(client, ['--mode', 'expanded'], testToken);

      expect(exitCode).toBe(0);
      expect(mockedBlob.list).toHaveBeenCalledWith({
        token: testToken,
        limit: 10,
        cursor: undefined,
        mode: 'expanded',
        prefix: undefined,
      });
    });

    it('should handle various limit values', async () => {
      const limitValues = [1, 5, 10, 50, 100, 1000];

      for (const limit of limitValues) {
        const exitCode = await list(
          client,
          ['--limit', String(limit)],
          testToken
        );
        expect(exitCode).toBe(0);
        expect(mockedBlob.list).toHaveBeenCalledWith({
          token: testToken,
          limit,
          cursor: undefined,
          mode: 'expanded',
          prefix: undefined,
        });
      }
    });
  });

  describe('table formatting and output', () => {
    it('should format table with correct headers and data', async () => {
      const exitCode = await list(client, [], testToken);

      expect(exitCode).toBe(0);
      expect(mockedTable).toHaveBeenCalledWith(
        [
          expect.arrayContaining(['Uploaded At', 'Size', 'Pathname', 'URL']),
          expect.arrayContaining([
            expect.any(String),
            '1024',
            'file1.txt',
            'https://example.com/file1.txt',
          ]),
          expect.arrayContaining([
            expect.any(String),
            '2048',
            'folder/file2.jpg',
            'https://example.com/file2.jpg',
          ]),
        ],
        { hsep: 5 }
      );
    });

    it('should handle empty blob list', async () => {
      mockedBlob.list.mockResolvedValue({
        blobs: [],
        cursor: undefined,
        hasMore: false,
      });

      const exitCode = await list(client, [], testToken);

      expect(exitCode).toBe(0);
      expect(mockedOutput.log).toHaveBeenCalledWith('No blobs in this store');
      expect(mockedOutput.print).not.toHaveBeenCalled();
    });
  });

  describe('pagination', () => {
    it('should show pagination command when cursor is available', async () => {
      mockedBlob.list.mockResolvedValue({
        blobs: [
          {
            url: 'https://example.com/file1.txt',
            downloadUrl: 'https://example.com/file1.txt',
            pathname: 'file1.txt',
            size: 1024,
            uploadedAt: new Date('2023-01-01T12:00:00Z'),
          },
        ],
        cursor: 'next_cursor_123',
        hasMore: true,
      });

      const exitCode = await list(client, ['--limit', '5'], testToken);

      expect(exitCode).toBe(0);
      expect(mockedOutput.log).toHaveBeenCalledWith(
        'To display the next page run `vercel blob list --limit 5 --cursor next_cursor_123`'
      );
    });

    it('should not show pagination when no cursor', async () => {
      mockedBlob.list.mockResolvedValue({
        blobs: [
          {
            url: 'https://example.com/file1.txt',
            downloadUrl: 'https://example.com/file1.txt',
            pathname: 'file1.txt',
            size: 1024,
            uploadedAt: new Date('2023-01-01T12:00:00Z'),
          },
        ],
        cursor: undefined,
        hasMore: false,
      });

      const exitCode = await list(client, [], testToken);

      expect(exitCode).toBe(0);
      // Should not call log with pagination message
      expect(mockedOutput.log).not.toHaveBeenCalledWith(
        expect.stringContaining('To display the next page')
      );
    });

    it('should preserve flags in pagination command', async () => {
      mockedBlob.list.mockResolvedValue({
        blobs: [],
        cursor: 'paginated_cursor',
        hasMore: true,
      });

      const exitCode = await list(
        client,
        ['--limit', '10', '--prefix', 'test/', '--mode', 'folded'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedOutput.log).toHaveBeenCalledWith(
        expect.stringContaining(
          '--limit 10 --prefix test/ --mode folded --cursor paginated_cursor'
        )
      );
    });
  });

  describe('mode validation', () => {
    it('should accept folded mode', async () => {
      const exitCode = await list(client, ['--mode', 'folded'], testToken);

      expect(exitCode).toBe(0);
      expect(mockedBlob.list).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'folded' })
      );
    });

    it('should accept expanded mode', async () => {
      const exitCode = await list(client, ['--mode', 'expanded'], testToken);

      expect(exitCode).toBe(0);
      expect(mockedBlob.list).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'expanded' })
      );
    });

    it('should reject invalid mode', async () => {
      const exitCode = await list(client, ['--mode', 'invalid'], testToken);

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        "Invalid mode: invalid has to be either 'folded' or 'expanded'"
      );
      expect(mockedBlob.list).not.toHaveBeenCalled();
    });

    it('should reject other invalid modes', async () => {
      const invalidModes = ['compact', 'detailed', 'json', ''];

      for (const mode of invalidModes) {
        const exitCode = await list(client, ['--mode', mode], testToken);
        expect(exitCode).toBe(1);
        expect(mockedOutput.error).toHaveBeenCalledWith(
          `Invalid mode: ${mode} has to be either 'folded' or 'expanded'`
        );
      }
    });
  });

  describe('error cases', () => {
    it('should return 1 when argument parsing fails', async () => {
      const parseError = new Error('Invalid argument');
      vi.doMock('../../../../src/util/get-args', () => ({
        parseArguments: vi.fn().mockImplementation(() => {
          throw parseError;
        }),
      }));

      const exitCode = await list(client, ['--invalid-flag'], testToken);
      expect(exitCode).toBe(1);
    });

    it('should return 1 when blob listing fails', async () => {
      const listError = new Error('Blob listing failed');
      mockedBlob.list.mockRejectedValue(listError);

      const exitCode = await list(client, [], testToken);

      expect(exitCode).toBe(1);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Fetching blobs');
      expect(mockedOutput.stopSpinner).not.toHaveBeenCalled();
      expect(mockedOutput.print).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Network error');
      mockedBlob.list.mockRejectedValue(apiError);

      const exitCode = await list(client, ['--limit', '5'], testToken);

      expect(exitCode).toBe(1);
      expect(mockedOutput.print).not.toHaveBeenCalled();
    });
  });

  describe('telemetry tracking', () => {
    it('should track limit option', async () => {
      const exitCode = await list(client, ['--limit', '25'], testToken);

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:limit',
          value: '25',
        },
      ]);
    });

    it('should track cursor option', async () => {
      const exitCode = await list(
        client,
        ['--cursor', 'test_cursor_123'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:cursor',
          value: 'test_cursor_123',
        },
      ]);
    });

    it('should track prefix option', async () => {
      const exitCode = await list(client, ['--prefix', 'uploads/'], testToken);

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:prefix',
          value: '[REDACTED]',
        },
      ]);
    });

    it('should track mode option', async () => {
      const exitCode = await list(client, ['--mode', 'folded'], testToken);

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:mode',
          value: 'folded',
        },
      ]);
    });

    it('should not track options when not provided', async () => {
      const exitCode = await list(client, [], testToken);

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([]);
    });
  });

  describe('prefix filtering', () => {
    it('should pass prefix to blob.list', async () => {
      const exitCode = await list(client, ['--prefix', 'images/'], testToken);

      expect(exitCode).toBe(0);
      expect(mockedBlob.list).toHaveBeenCalledWith({
        token: testToken,
        limit: 10,
        cursor: undefined,
        mode: 'expanded',
        prefix: 'images/',
      });
    });

    it('should handle various prefix patterns', async () => {
      const prefixes = [
        'folder/',
        'deep/nested/path/',
        'file-prefix',
        '2023/',
        'user_uploads/',
      ];

      for (const prefix of prefixes) {
        const exitCode = await list(client, ['--prefix', prefix], testToken);
        expect(exitCode).toBe(0);
        expect(mockedBlob.list).toHaveBeenCalledWith(
          expect.objectContaining({ prefix })
        );
      }
    });
  });

  describe('spinner and output behavior', () => {
    it('should show spinner during fetch and stop on success', async () => {
      const exitCode = await list(client, [], testToken);

      expect(exitCode).toBe(0);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Fetching blobs');
      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
    });

    it('should not stop spinner on fetch error', async () => {
      const fetchError = new Error('Fetch failed');
      mockedBlob.list.mockRejectedValue(fetchError);

      const exitCode = await list(client, [], testToken);

      expect(exitCode).toBe(1);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Fetching blobs');
      expect(mockedOutput.stopSpinner).not.toHaveBeenCalled();
    });

    it('should show debug output', async () => {
      const exitCode = await list(client, [], testToken);

      expect(exitCode).toBe(0);
      expect(mockedOutput.debug).toHaveBeenCalledWith('Fetching blobs');
    });
  });

  describe('large datasets', () => {
    it('should handle many blobs efficiently', async () => {
      const manyBlobs = Array.from({ length: 100 }, (_, i) => ({
        url: `https://example.com/file${i}.txt`,
        downloadUrl: `https://example.com/file${i}.txt`,
        pathname: `file${i}.txt`,
        size: 1000 + i,
        uploadedAt: new Date(
          `2023-01-${String((i % 30) + 1).padStart(2, '0')}T12:00:00Z`
        ),
      }));

      mockedBlob.list.mockResolvedValue({
        blobs: manyBlobs,
        cursor: 'large_dataset_cursor',
        hasMore: true,
      });

      const exitCode = await list(client, ['--limit', '100'], testToken);

      expect(exitCode).toBe(0);
      expect(mockedTable).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.any(Array), // headers
          ...manyBlobs.map(() => expect.any(Array)), // data rows
        ]),
        { hsep: 5 }
      );
    });
  });
});
