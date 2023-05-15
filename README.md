# openapi-to-ts-client
CLI tool to convert openapi 3.0 into typescript client

## Installation

```bash
npm install -g openapi-to-ts-client
```

## Usage

```bash
openapi-to-ts-client --help
```

```
Usage: openapi-to-ts-client [input] [options]
┌─────────────────────────────────────────────────────┐
│                                                     │
│   Convert OpenAPI definition to typescript client   │
│                                                     │
└─────────────────────────────────────────────────────┘


Options:
      --version    Show version number                                 [boolean]
  -o, --output     Output directory                     [string] [default: "./"]
  -c, --client     Client filename           [string] [default: "api_client.ts"]
  -t, --contracts  Contracts filename    [string] [default: "data_contracts.ts"]
  -f, --fetch      Fetch wrapper filename [string] [default: "fetch_wrapper.ts"]
      --help       Show help                                           [boolean]
```
## Example

```bash
openapi-to-ts-client ./openapi.json -o ./src/api
```

## Dependencies

The generated code has a few dependencies that need to be installed in your project.

### Fetch wrapper

The fetch wrapper is a simple wrapper around the fetch api. It is used to make the api client more testable. The default implementation is as follows:

```typescript
import queryString from 'qs';

type DataResponse<TData = null> = Response & {
  data: TData | null;
};
export interface Constraint {
  constraints: Record<string, string>;
  property: string;
  value: string;
}
export interface DataError {
  code: string;
  info: string;
  message: string;
  constraints: Constraint[];
}

export class fetchWrapper {
  static globalReqInfo: RequestInit = {
    credentials: 'include',
  };

  static send = async <TData = null>(
    url: string,
    reqInfo: RequestInit,
    params?: Record<string, unknown>,
  ): Promise<{
    response: DataResponse<TData> | null;
    error: null | DataError;
  }> => {
    try {
      const preparedUrl = params
        ? `${url}?${queryString.stringify(params, {
            skipNulls: true,
            arrayFormat: 'brackets',
          })}`
        : url;
      const response = (await fetch(preparedUrl, {
        ...reqInfo,
        ...fetchWrapper.globalReqInfo,
      })) as DataResponse<TData>;

      const respData = await response.text();
      const parsedRespData = respData ? JSON.parse(respData) : null;
      if (response.ok) {
        response.data = parsedRespData;
        return { response, error: null };
      }
      console.error('fetch response unsuccessful', response);
      return {
        response: null,
        error: {
          code: response.status,
          info: response.statusText,
          ...parsedRespData,
        },
      };
    } catch (ex) {
      console.error('fetch operation failed', ex);
      return { response: null, error: ex as DataError };
    }
  };
}
```

Only requirement is to implement following interface:

```typescript
export interface IFetchWrapper<R> {
  send<TData = null>(
    url: string,
    reqInfo: RequestInit,
    params?: Record<string, unknown>,
  ): Promise<R>;
}
```

### Constants

The generated code uses a few constants that need to be defined in your project in the file `<output dir>/constants.ts`

```typescript
export const API_BASE_URL = 'http://localhost:3000';
```

## Generated code

The generated code is split into 2 files:

- `{--output}{--client}.ts` - contains the api client
- `{--output}{--contracts}.ts` - contains the data contracts

> !IMPORTANT! The generated code is not prettified, so you might want to run prettier on it.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

MIT
