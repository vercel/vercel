# UpdateProjectGroup

The group of microfrontends that this project belongs to. Each microfrontend project must belong to a microfrontends group that is the set of microfrontends that are used together.

## Example Usage

```typescript
import { UpdateProjectGroup } from "@vercel/sdk/models/operations/updateproject.js";

let value: UpdateProjectGroup = {
  id: "<id>",
  slug: "<value>",
};
```

## Fields

| Field                                                                                                                                                       | Type                                                                                                                                                        | Required                                                                                                                                                    | Description                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                                                                                                        | *string*                                                                                                                                                    | :heavy_check_mark:                                                                                                                                          | A unique identifier for the group of microfrontends. All related microfrontend projects will share this group ID. Example: mfe_12HKQaOmR5t5Uy6vdcQsNIiZgHGB |
| `slug`                                                                                                                                                      | *string*                                                                                                                                                    | :heavy_check_mark:                                                                                                                                          | A human readable name for the microfrontends group. This will be used to display the microfrontends group in the UI.                                        |