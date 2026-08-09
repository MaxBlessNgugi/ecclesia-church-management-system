// =============================================================================
// Type shims for packages that ship no TypeScript declarations.
// -----------------------------------------------------------------------------
// These let the TypeScript compiler resolve imports without --skipLibCheck
// issues. They are intentionally minimal — only the surfaces we actually call.
// =============================================================================

declare module 'africastalking' {
  interface ATSMSSendParams {
    to: string | string[];
    message: string;
    from?: string;
  }
  interface ATSMSService {
    send(params: ATSMSSendParams): Promise<unknown>;
  }
  interface ATInstance {
    SMS: ATSMSService;
    [key: string]: unknown;
  }
  interface ATConfig {
    apiKey: string;
    username?: string;
  }
  function AfricasTalking(config: ATConfig): ATInstance;
  export = AfricasTalking;
}

declare module 'archiver' {
  interface Archiver {
    pipe(destination: NodeJS.WritableStream): this;
    append(data: string | Buffer, options: { name: string; [k: string]: unknown }): this;
    finalize(): Promise<void>;
  }
  interface ArchiverOptions {
    zlib?: { level?: number };
    forceLocalTime?: boolean;
    [k: string]: unknown;
  }
  function create(format: 'zip' | 'tar' | string, options?: ArchiverOptions): Archiver;
  export default create;
}
