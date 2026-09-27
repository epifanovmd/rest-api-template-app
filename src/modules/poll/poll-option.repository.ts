import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { PollOption } from "./poll-option.entity";

@InjectableRepository(PollOption)
export class PollOptionRepository extends BaseRepository<PollOption> {}
