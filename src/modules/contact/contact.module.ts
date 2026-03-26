import { Module } from "../../core";
import { asSocketListener } from "../socket";
import { ContactController } from "./contact.controller";
import { ContactListener } from "./contact.listener";
import { ContactRepository } from "./contact.repository";
import { ContactService } from "./contact.service";

@Module({
  providers: [
    ContactRepository,
    ContactService,
    ContactController,
    asSocketListener(ContactListener),
  ],
})
export class ContactModule {}
