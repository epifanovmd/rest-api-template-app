import { config } from "../../config";
import { FileStorage, Module, ROUTE_PROVIDER } from "../../core";
import { LocalFileStorage } from "./local-file.storage";
import { S3FileStorage } from "./s3-file.storage";
import { StorageRouteProvider } from "./storage.routes";
import { StorageUrlSigner } from "./storage-url.signer";

/** Хранилище файлов: драйверы local и S3, подписанные ссылки, раздача. */
@Module({
  providers: [
    StorageUrlSigner,
    {
      provide: FileStorage,
      useClass:
        config.storage.driver === "s3" ? S3FileStorage : LocalFileStorage,
    },
    { provide: ROUTE_PROVIDER, useClass: StorageRouteProvider },
  ],
})
export class StorageModule {}
