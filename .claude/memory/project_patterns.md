---
name: Code Patterns & Conventions
description: Паттерны написания кода — как создавать модули, контроллеры, сервисы, DTOs, события, socket handlers. Правила которые нельзя нарушать
type: project
---

## Создание нового модуля (checklist)

1. Создать `src/modules/feature/feature.module.ts`:
```typescript
@Module({
  providers: [FeatureRepository, FeatureService, FeatureController],
})
export class FeatureModule {}
```

2. Добавить в `AppModule.imports` (перед SocketModule)

3. Entity: `@Entity()` + TypeORM columns + relations

4. Repository: `@InjectableRepository(Feature) extends BaseRepository<Feature>`

5. Service: `@Injectable()`, inject через constructor, бизнес-логика

6. Controller: `@Injectable()`, `@Tags("Feature")`, `@Route("api/feature")`, extends Controller

7. DTO: class extends BaseDto, static `fromEntity(entity)`

8. Validation: Zod schemas + `@ValidateBody(schema)` на контроллере

9. `yarn generate` — обновить routes.ts

## Controller Pattern

```typescript
@Injectable()
@Tags("Feature")
@Route("api/feature")
export class FeatureController extends Controller {
  constructor(@inject(FeatureService) private _service: FeatureService) {
    super();
  }

  @Security("jwt", ["permission:feature:view"])
  @Get("{id}")
  async getById(@Path() id: string): Promise<FeatureDto> {
    return this._service.getById(id).then(FeatureDto.fromEntity);
  }
}
```

## Service Pattern

```typescript
@Injectable()
export class FeatureService {
  constructor(
    @inject(FeatureRepository) private _repo: FeatureRepository,
    @inject(EventBus) private _eventBus: EventBus,
  ) {}

  async create(data: CreateDto): Promise<Feature> {
    const entity = await this._repo.createAndSave(data);
    this._eventBus.emit(new FeatureCreatedEvent(entity));
    return entity;
  }
}
```

## DTO Pattern

```typescript
export class FeatureDto extends BaseDto {
  id: string;
  name: string;

  constructor(entity: Feature) {
    super(entity);  // throws if entity undefined
    this.id = entity.id;
    this.name = entity.name;
  }

  static fromEntity(entity: Feature): FeatureDto {
    return new FeatureDto(entity);
  }
}
```

BaseDto кидает HttpException если entity === undefined (защита от забытых relations).

## Repository Pattern

```typescript
@InjectableRepository(Feature)
export class FeatureRepository extends BaseRepository<Feature> {
  findById(id: string) {
    return this.findOne({ where: { id }, relations: { ... } });
  }
}
```

Транзакции: `this._repo.withTransaction((repo, em) => { ... })` — НЕ ручной QueryRunner.

## Validation Pattern (Zod)

```typescript
// validation/create-feature.validate.ts
export const CreateFeatureSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.nativeEnum(EFeatureType),
});

// В контроллере:
@ValidateBody(CreateFeatureSchema)
@Post()
async create(@Body() body: ICreateFeatureDto): Promise<FeatureDto> { ... }
```

При ошибке валидации: BadRequestException с field-level messages.

## Socket Event Pattern

Для real-time уведомлений из нового модуля:

```typescript
// 1. Event class
export class FeatureUpdatedEvent {
  constructor(public readonly feature: FeatureDto) {}
}

// 2. Listener (ISocketEventListener)
@Injectable()
export class FeatureListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private _eventBus: EventBus,
    @inject(SocketEmitterService) private _emitter: SocketEmitterService,
  ) {}

  register(): void {
    this._eventBus.on(FeatureUpdatedEvent, event => {
      this._emitter.toRoom("feature", "feature:updated", event.feature);
    });
  }
}

// 3. Handler (ISocketHandler) — optional, for client subscriptions
@Injectable()
export class FeatureHandler implements ISocketHandler {
  onConnection(socket: TSocket): void {
    socket.on("feature:subscribe", () => socket.join("feature"));
  }
}

// 4. Register in module
@Module({
  providers: [
    FeatureService,
    { provide: SOCKET_EVENT_LISTENER, useClass: FeatureListener },
    { provide: SOCKET_HANDLER, useClass: FeatureHandler },
  ],
})
```

## Добавление нового Permission

1. Добавить в `EPermissions` enum (`src/modules/permission/permission.types.ts`):
```typescript
FEATURE_VIEW = "feature:view",
FEATURE_MANAGE = "feature:manage",
FEATURE_ALL = "feature:*",  // wildcard
```

2. Использовать в контроллере: `@Security("jwt", ["permission:feature:view"])`

3. Обновить `seedDefaultPermissions()` в RoleService если нужно дать роли по умолчанию

## Правила которые нельзя нарушать

- **Сервисы НЕ инжектируют** SocketService/SocketEmitterService — только EventBus
- **Кросс-модульное взаимодействие** только через EventBus (domain events)
- **Ошибки** только из `@force-dev/utils`: BadRequestException, NotFoundException, ForbiddenException, ConflictException, UnauthorizedException. Никогда `new Error()`
- **Логирование** только через LoggerService/logger (pino), никогда `console.*`
- **Контроллеры** обязательно в `@Module.providers` — tsoa требует IoC bind
- **SocketModule** последний в imports AppModule
- **routes.ts** никогда не редактировать — `yarn generate`
- **@Security scopes** используют `"permission:..."`, не `"role:..."` (кроме legacy user-admin endpoints с `"role:admin"`)
