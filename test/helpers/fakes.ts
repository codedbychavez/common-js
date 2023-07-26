import { IConfigCatCache, LogEventId } from "../../lib";
import { IConfigCache } from "../../src/ConfigCatCache";
import { IConfigCatKernel } from "../../src/ConfigCatClient";
import { OptionsBase } from "../../src/ConfigCatClientOptions";
import { IConfigCatLogger, LogLevel, LogMessage } from "../../src/ConfigCatLogger";
import { IConfigFetcher, IFetchResponse } from "../../src/ConfigFetcher";
import { ProjectConfig } from "../../src/ProjectConfig";
import { delay } from "../../src/Utils";

export class FakeLogger implements IConfigCatLogger {
  messages: [LogLevel, LogEventId, string, any?][] = [];

  constructor(public level = LogLevel.Info) { }

  reset(): void { this.messages.splice(0); }

  log(level: LogLevel, eventId: number, message: LogMessage, exception?: any): void {
    this.messages.push([level, eventId, message.toString(), exception]);
  }
}

export class FakeConfigCatKernel implements IConfigCatKernel {
  configFetcher!: IConfigFetcher;
  sdkType = "common";
  sdkVersion = "1.0.0";
  defaultCacheFactory?: (options: OptionsBase) => IConfigCache;
}

export class FakeCache implements IConfigCache {
  cached: ProjectConfig;

  constructor(cached: ProjectConfig | null = null) {
    this.cached = cached ?? ProjectConfig.empty;
  }

  get localCachedConfig(): ProjectConfig { return this.cached; }

  set(_key: string, config: ProjectConfig): Promise<void> | void {
    this.cached = config;
  }

  get(_key: string): Promise<ProjectConfig> | ProjectConfig {
    return this.cached;
  }

  getInMemory(): ProjectConfig {
    return this.cached;
  }
}

export class FakeExternalCacheWithInitialData implements IConfigCatCache {
  expirationDelta: number;

  constructor(expirationDelta = 0) {
    this.expirationDelta = expirationDelta;
  }

  set(key: string, value: string): void | Promise<void> {
    throw new Error("Method not implemented.");
  }
  get(key: string): string | Promise<string | null | undefined> | null | undefined {
    const cachedJson = '{"f": { "debug": { "v": true, "i": "abcdefgh", "t": 0, "p": [], "r": [] } } }';
    const config = new ProjectConfig(cachedJson, JSON.parse(cachedJson), (new Date().getTime()) - this.expirationDelta, "\"ETAG\"");
    return ProjectConfig.serialize(config);
  }

}

export class FakeConfigFetcherBase implements IConfigFetcher {
  calledTimes = 0;

  constructor(
    private config: string | null,
    private readonly callbackDelay: number = 0,
    private readonly getFetchResponse?: (lastConfig: string | null, lastEtag: string | null) => IFetchResponse) {

    this.config ??= this.defaultConfigJson;
  }

  protected get defaultConfigJson(): string | null { return null; }

  async fetchLogic(options: OptionsBase, lastEtag: string | null): Promise<IFetchResponse> {
    const nextFetchResponse = this.getFetchResponse
      ? (lastConfig: string | null, lastEtag: string | null) => {
        const fr = this.getFetchResponse!(lastConfig, lastEtag);
        this.config = fr.body ?? null;
        return fr;
      }
      : () => this.config !== null
        ? { statusCode: 200, reasonPhrase: "OK", eTag: this.getEtag(), body: this.config } as IFetchResponse
        : { statusCode: 404, reasonPhrase: "Not Found" } as IFetchResponse;

    await delay(this.callbackDelay);

    this.calledTimes++;
    return nextFetchResponse(this.config, lastEtag);
  }

  protected getEtag(): string {
    return "etag";
  }
}

export class FakeConfigFetcher extends FakeConfigFetcherBase {
  static get configJson(): string {
    return '{"f": { "debug": { "v": true, "i": "abcdefgh", "t": 0, "p": [], "r": [] } } }';
  }

  ["constructor"]!: typeof FakeConfigFetcher;

  protected get defaultConfigJson(): string | null { return this.constructor.configJson; }

  constructor(callbackDelayInMilliseconds = 0) {
    super(null, callbackDelayInMilliseconds);
  }
}

export class FakeConfigFetcherWithTwoKeys extends FakeConfigFetcher {
  static get configJson(): string {
    return '{"f": { "debug": { "v": true, "i": "abcdefgh", "t": 0, "p": [], "r": [] }, "debug2": { "v": true, "i": "12345678", "t": 0, "p": [], "r": [] } } }';
  }
}

export class FakeConfigFetcherWithTwoCaseSensitiveKeys extends FakeConfigFetcher {
  static get configJson(): string {
    return '{"f": { "debug": { "v": "debug", "i": "abcdefgh", "t": 1, "p": [], "r": [{ "o":0, "a":"CUSTOM", "t":0, "c":"c", "v":"UPPER-VALUE", "i":"6ada5ff2"}, { "o":1, "a":"custom", "t":0, "c":"c", "v":"lower-value", "i":"6ada5ff2"}] }, "DEBUG": { "v": "DEBUG", "i": "12345678", "t": 1, "p": [], "r": [] } } }';
  }
}

export class FakeConfigFetcherWithTwoKeysAndRules extends FakeConfigFetcher {
  static get configJson(): string {
    return '{"f": { "debug": { "v": "def", "i": "abcdefgh", "t": 1, "p": [], "r": [{ "o":0, "a":"a", "t":1, "c":"abcd", "v":"value", "i":"6ada5ff2"}] }, "debug2": { "v": "def", "i": "12345678", "t": 1, "p": [{"o":0, "v":"value1", "p":50, "i":"d227b334" }, { "o":1, "v":"value2", "p":50, "i":"622f5d07" }], "r": [] } } }';
  }
}

export class FakeConfigFetcherWithRules extends FakeConfigFetcher {
  static get configJson(): string {
    return '{"f": { "debug": { "v": "defaultValue", "i": "defaultVariationId", "t": 0, "p": [], "r": [{ "o":0, "a":"eyeColor", "t":0, "c":"red", "v":"redValue", "i":"redVariationId"}, { "o":1, "a":"eyeColor", "t":0, "c":"blue", "v":"blueValue", "i":"blueVariationId"}] } } }';
  }
}

export class FakeConfigFetcherWithNullNewConfig extends FakeConfigFetcherBase {
  constructor(callbackDelayInMilliseconds = 0) {
    super(null, callbackDelayInMilliseconds);
  }
}

export class FakeConfigFetcherWithAlwaysVariableEtag extends FakeConfigFetcher {
  static get configJson(): string {
    return '{ "f": { "debug": { "v": true, "i": "abcdefgh", "t": 0, "p": [], "r": [] } }}';
  }

  getEtag(): string {
    return Math.random().toString();
  }
}

export class FakeConfigFetcherWithPercantageRules extends FakeConfigFetcher {
  static get configJson(): string {
    return '{"f":{"string25Cat25Dog25Falcon25Horse":{"v":"Chicken","i":"ChickenVariationId","t":1,"p":[{"o":0,"v":"Cat","p":25,"i":"CatVariationId"},{"o":1,"v":"Dog","p":25,"i":"DogVariationId"},{"o":2,"v":"Falcon","p":25,"i":"FalconVariationId"},{"o":3,"v":"Horse","p":25,"i":"HorseVariationId"}],"r":[]}}}';
  }
}
