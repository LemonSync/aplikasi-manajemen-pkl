/**
 * Deklarasi tipe untuk library tanpa bundled types.
 */
declare module 'docxtemplater' {
  const Docxtemplater: new (zip: unknown, opts?: Record<string, unknown>) => {
    render: (data: Record<string, unknown>) => void;
    getZip: () => { generate: (opts: Record<string, unknown>) => Buffer };
  };
  export default Docxtemplater;
}

declare module 'pizzip' {
  class PizZip {
    constructor(data: Buffer | string);
    static loadAsync(data: Buffer): Promise<PizZip>;
    file(name: string): { asText: () => string } | null;
    generate(opts: Record<string, unknown>): Buffer;
  }
  export default PizZip;
}