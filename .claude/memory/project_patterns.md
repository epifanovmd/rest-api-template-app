---
name: Code Patterns & Conventions
description: Паттерны написания кода — модули, контроллеры, сервисы, DTOs, события, socket, тесты. Правила которые нельзя нарушать
type: project
---

## Создание нового модуля (checklist)

1. `src/modules/feature/feature.module.ts`:
```typescript
@Module({
  providers: [FeatureRepository, FeatureService, FeatureController,
              asSocketHandler(FeatureHandler), asSocketListener(FeatureListener)],
  bootstrappers: [FeatureBootstrap], // опционально
})
export class FeatureModule {}
```

2. Зарегистрировать в `src/app.module.ts` (перед SocketModule)
3. Entity → Repository → Service → Controller → DTO → Validation → Events → Socket

## Entity

```typescript
@Entity("features")
@Index("IDX_FEATURES_USER", ["userId"])
export class Feature {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ name: "user_id", type: "uuid" }) userId: string;
  @Column({ type: "varchar", length: 100 }) name: string;
  @Column({ type: "jsonb", nullable: true }) metadata: Record<string, unknown> | null;
  @CreateDateColumn({ name: "created_at" }) createdAt: Date;
  @UpdateDateColumn({ name: "updated_at" }) updatedAt: Date;
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" }) user: User;
}
```

## Repository

```typescript
@InjectableRepository(Feature)
export class FeatureRepository extends BaseRepository<Feature> {
  async findByUserId(userId: string) {
    return this.find({ where: { userId }, order: { createdAt: "DESC" } });
  }
}
```

## Service

```typescript
@Injectable()
export class FeatureService {
  constructor(
    @inject(FeatureRepository) private _repo: FeatureRepository,
    @inject(EventBus) private _eventBus: EventBus,
  ) {}

  async create(userId: string, data: {...}) {
    const entity = await this._repo.createAndSave({ userId, ...data });
    this._eventBus.emit(new FeatureCreatedEvent(entity));
    return FeatureDto.fromEntity(entity);
  }
}
```

## Controller

```typescript
@Injectable()
@Tags("Feature")
@Route("api/feature")
export class FeatureController extends Controller {
  constructor(@inject(FeatureService) private _service: FeatureService) { super(); }

  @Security("jwt")
  @ValidateBody(CreateFeatureSchema)
  @Post()
  create(@Request() req: KoaRequest, @Body() body: ICreateBody): Promise<FeatureDto> {
    const user = getContextUser(req);
    return this._service.create(user.userId, body);
  }
}
```

## DTO

```typescript
export class FeatureDto extends BaseDto {
  id: string;
  name: string;
  constructor(entity: Feature) {
    super(entity);
    this.id = entity.id;
    this.name = entity.name;
  }
  static fromEntity(entity: Feature) { return new FeatureDto(entity); }
}
```

## Validation (Zod)

```typescript
export const CreateFeatureSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});
```

Export из `validation/index.ts`.

## Events

```typescript
export class FeatureCreatedEvent {
  constructor(public readonly feature: Feature) {}
}
```

## Socket Handler (client → server)

```typescript
@Injectable()
export class FeatureHandler implements ISocketHandler {
  onConnection(socket: TSocket): void {
    socket.on("feature:action", async (data) => {
      // handle
    });
  }
}
```

## Socket Listener (EventBus → server → client)

```typescript
@Injectable()
export class FeatureListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private _eventBus: EventBus,
    @inject(SocketEmitterService) private _emitter: SocketEmitterService,
  ) {}
  register(): void {
    this._eventBus.on(FeatureCreatedEvent, (event) => {
      this._emitter.toUser(event.feature.userId, "feature:created", dto);
    });
  }
}
```

Регистрация: `asSocketHandler(cls)` / `asSocketListener(cls)` в @Module.

## Тесты (Mocha + Chai + Sinon)

```typescript
import "reflect-metadata";
import { expect } from "chai";
import sinon from "sinon";
import { createMockRepository, createMockEventBus, uuid } from "../../test/helpers";

describe("FeatureService", () => {
  let service: FeatureService;
  let mockRepo: ReturnType<typeof createMockRepository>;
  let mockEventBus: ReturnType<typeof createMockEventBus>;
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    mockRepo = createMockRepository();
    mockEventBus = createMockEventBus();
    service = new FeatureService(mockRepo as any, mockEventBus as any);
  });
  afterEach(() => sandbox.restore());

  it("should create feature", async () => {
    mockRepo.createAndSave.resolves({ id: uuid(), name: "test" });
    const result = await service.create(uuid(), { name: "test" });
    expect(result).to.exist;
    expect(mockEventBus.emit.calledOnce).to.be.true;
  });
});
```

Файл `.test.ts` рядом с сервисом. Test helpers: `src/test/helpers.ts`.

## Правила

1. **routes.ts** — НИКОГДА не редактировать вручную (авто-генерация tsoa)
2. **@Injectable()** — НЕ регистрирует в контейнере. Только `@Module.providers`
3. **Сервисы НЕ инжектят SocketService** — используют EventBus
4. **Controller body interfaces** — объявляются в контроллере, НЕ экспортируются
5. **Security scopes** — `permission:name`, НЕ `role:name` (кроме admin endpoints)
6. **Naming:** entity singular (User), table plural (users), column snake_case, field camelCase
7. **Soft delete** — для сообщений (isDeleted=true, content=null), НЕ hard delete
8. **Cascades** — через TypeORM (onDelete: CASCADE/SET NULL), НЕ через код
9. **Validation** — Zod на входе, НЕ в service layer
10. **Enums** — в `*.types.ts`, НЕ в entity файле
