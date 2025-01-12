import { IdentityProvider, IdentityData, Identity } from "fabric-network";
import { FabricSigningCredentialType } from "../generated/openapi/typescript-axios/api";
import { Checks } from "@hyperledger/cactus-common";
import { ICryptoSuite, User, Utils, ICryptoKey } from "fabric-common";
import {
  LogLevelDesc,
  Logger,
  LoggerProvider,
} from "@hyperledger/cactus-common";
import { Key } from "./internal/key";
import { InternalCryptoSuite } from "./internal/crypto-suite";
import { VaultTransitClient } from "./vault-client";

export interface IVaultConfig {
  endpoint: string;
  transitEngineMountPath: string;
}

export interface ISecureIdentityProvidersOptions {
  activatedProviders: FabricSigningCredentialType[];
  logLevel: LogLevelDesc;

  // vault server config
  vaultConfig?: IVaultConfig;
}

export interface IIdentity extends Identity {
  type: FabricSigningCredentialType;
  credentials: {
    certificate: string;
    key: ICryptoKey;
  };
}

export interface VaultKey {
  keyName: string;
  token: string;
}

export interface DefaultKey {
  // pem encoded private key
  private: string;
}

// SecureIdentityProviders : a entry point class to various secure identity provider
// some of the function are just to support the interface provided by the fabric-sdk-node
export class SecureIdentityProviders implements IdentityProvider {
  private readonly log: Logger;
  public readonly className = "SecureIdentityProviders";
  private readonly defaultSuite: ICryptoSuite;
  constructor(private readonly opts: ISecureIdentityProvidersOptions) {
    const fnTag = `${this.className}#constructor`;
    this.log = LoggerProvider.getOrCreate({
      level: opts.logLevel || "INFO",
      label: this.className,
    });
    if (
      opts.activatedProviders.includes(FabricSigningCredentialType.VaultX509)
    ) {
      if (!opts.vaultConfig) {
        throw new Error(`${fnTag} require options.vaultConfig`);
      }
      Checks.nonBlankString(
        opts.vaultConfig.endpoint,
        `${fnTag} options.vaultConfig.endpoint`,
      );
      Checks.nonBlankString(
        opts.vaultConfig.transitEngineMountPath,
        `${fnTag} options.vaultConfig.transitEngineMountPath`,
      );
      this.log.debug(`${fnTag} Vault-X.509 identity provider activated`);
    }
    this.defaultSuite = Utils.newCryptoSuite();
  }

  async getUserContext(identity: IIdentity, name: string): Promise<User> {
    const fnTag = `${this.className}#getUserContext`;
    Checks.truthy(identity, `${fnTag} identity`);
    if (!this.opts.activatedProviders.includes(identity.type)) {
      throw new Error(
        `${fnTag} identity type = ${identity.type} not activated`,
      );
    }
    Checks.truthy(identity.credentials, `${fnTag} identity.credentials`);
    Checks.nonBlankString(
      identity.credentials.certificate,
      `${fnTag} identity.credentials.certificate`,
    );
    Checks.truthy(
      identity.credentials.key,
      `${fnTag} identity.credentials.key`,
    );
    const user = new User(name);
    if (identity.type === FabricSigningCredentialType.X509) {
      user.setCryptoSuite(this.defaultSuite);
    } else {
      user.setCryptoSuite(new InternalCryptoSuite());
    }
    await user.setEnrollment(
      identity.credentials.key,
      identity.credentials.certificate,
      identity.mspId,
    );
    return user;
  }

  getVaultKey(key: VaultKey): Key {
    return new Key(
      key.keyName,
      new VaultTransitClient({
        endpoint: this.opts.vaultConfig?.endpoint as string,
        mountPath: this.opts.vaultConfig?.transitEngineMountPath as string,
        token: key.token,
        logLevel: this.opts.logLevel,
      }),
    );
  }

  getDefaultKey(key: DefaultKey): ICryptoKey {
    return this.defaultSuite.createKeyFromRaw(key.private);
  }

  // not required things
  readonly type = "";
  getCryptoSuite(): ICryptoSuite {
    throw new Error("SecureIdentityProviders::getCryptoSuite not required!!");
  }
  fromJson(): Identity {
    throw new Error("SecureIdentityProviders::fromJson not required!!");
  }
  toJson(): IdentityData {
    throw new Error("SecureIdentityProviders::toJso : not required!!");
  }
}
