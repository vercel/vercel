# UploadArtifactResponseBody

File successfully uploaded

## Example Usage

```typescript
import { UploadArtifactResponseBody } from '@vercel/client/models/operations';

let value: UploadArtifactResponseBody = {
  urls: ['https://api.vercel.com/v2/now/artifact/12HKQaOmR5t5Uy6vdcQsNIiZgHGB'],
};
```

## Fields

| Field  | Type       | Required           | Description                                  | Example                                                                           |
| ------ | ---------- | ------------------ | -------------------------------------------- | --------------------------------------------------------------------------------- |
| `urls` | _string_[] | :heavy_check_mark: | Array of URLs where the artifact was updated | [<br/>"https://api.vercel.com/v2/now/artifact/12HKQaOmR5t5Uy6vdcQsNIiZgHGB"<br/>] |
