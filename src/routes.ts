/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
  import { Controller, ValidationService, FieldErrors, ValidateError, TsoaRoute, HttpStatusCodeLiteral, TsoaResponse, fetchMiddlewares } from '@tsoa/runtime';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { UserController } from './modules/user/user.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AuthController } from './modules/auth/auth.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { BiometricController } from './modules/biometric/biometric.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { FcmTokenController } from './modules/fcm-token/fcm-token.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { DialogController } from './modules/dialog/dialog.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { FileController } from './modules/file/file.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { PasskeysController } from './modules/passkeys/passkeys.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ProfileController } from './modules/profile/profile.controller';
import { koaAuthentication } from './middleware/authenticate.middleware';
// @ts-ignore - no great way to install types from subpackage
const promiseAny = require('promise.any');
import { iocContainer } from './app.module';
import { IocContainer, IocContainerFactory } from '@tsoa/runtime';
import type { Middleware } from 'koa';
import * as KoaRouter from '@koa/router';
const multer = require('@koa/multer');
import multerOpts from '../multerOpts';
const upload = multer(multerOpts);

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
    "ERole": {
        "dataType": "refEnum",
        "enums": ["admin","user","guest"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EPermissions": {
        "dataType": "refEnum",
        "enums": ["read","write","delete"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IPermissionDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"ref":"EPermissions","required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IRoleDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"ref":"ERole","required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
            "permissions": {"dataType":"array","array":{"dataType":"refObject","ref":"IPermissionDto"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUserDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "email": {"dataType":"string"},
            "emailVerified": {"dataType":"boolean"},
            "phone": {"dataType":"string"},
            "challenge": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
            "role": {"ref":"IRoleDto","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUserUpdateRequestDto": {
        "dataType": "refObject",
        "properties": {
            "email": {"dataType":"string"},
            "phone": {"dataType":"string"},
            "roleId": {"dataType":"string"},
            "challenge": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUserListDto": {
        "dataType": "refObject",
        "properties": {
            "count": {"dataType":"double"},
            "offset": {"dataType":"double"},
            "limit": {"dataType":"double"},
            "data": {"dataType":"array","array":{"dataType":"refObject","ref":"IUserDto"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUserPrivilegesRequestDto": {
        "dataType": "refObject",
        "properties": {
            "roleName": {"ref":"ERole","required":true},
            "permissions": {"dataType":"array","array":{"dataType":"refEnum","ref":"EPermissions"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IApiResponseDto": {
        "dataType": "refObject",
        "properties": {
            "message": {"dataType":"string"},
            "data": {"dataType":"any"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUserChangePasswordDto": {
        "dataType": "refObject",
        "properties": {
            "password": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ITokensDto": {
        "dataType": "refObject",
        "properties": {
            "accessToken": {"dataType":"string","required":true},
            "refreshToken": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUserWithTokensDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "email": {"dataType":"string"},
            "emailVerified": {"dataType":"boolean"},
            "phone": {"dataType":"string"},
            "challenge": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
            "role": {"ref":"IRoleDto","required":true},
            "tokens": {"ref":"ITokensDto","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TSignUpRequestDto": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"intersection","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"password":{"dataType":"string","required":true},"lastName":{"dataType":"string"},"firstName":{"dataType":"string"}}},{"dataType":"union","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"phone":{"dataType":"string","required":true},"email":{"dataType":"string"}}},{"dataType":"nestedObjectLiteral","nestedProperties":{"phone":{"dataType":"string"},"email":{"dataType":"string","required":true}}}]}]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ISignInRequestDto": {
        "dataType": "refObject",
        "properties": {
            "login": {"dataType":"string","required":true},
            "password": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUserLoginRequestDto": {
        "dataType": "refObject",
        "properties": {
            "login": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUserResetPasswordRequestDto": {
        "dataType": "refObject",
        "properties": {
            "password": {"dataType":"string","required":true},
            "token": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IRegisterBiometricResponseDto": {
        "dataType": "refObject",
        "properties": {
            "registered": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IRegisterBiometricRequestDto": {
        "dataType": "refObject",
        "properties": {
            "userId": {"dataType":"string","required":true},
            "deviceId": {"dataType":"string","required":true},
            "deviceName": {"dataType":"string","required":true},
            "publicKey": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IGenerateNonceResponseDto": {
        "dataType": "refObject",
        "properties": {
            "nonce": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IGenerateNonceRequestDto": {
        "dataType": "refObject",
        "properties": {
            "userId": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IVerifyBiometricSignatureResponseDto": {
        "dataType": "refObject",
        "properties": {
            "verified": {"dataType":"boolean","required":true},
            "tokens": {"dataType":"nestedObjectLiteral","nestedProperties":{"refreshToken":{"dataType":"string","required":true},"accessToken":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IVerifyBiometricSignatureRequestDto": {
        "dataType": "refObject",
        "properties": {
            "userId": {"dataType":"string","required":true},
            "deviceId": {"dataType":"string","required":true},
            "signature": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IFCMMessageDto": {
        "dataType": "refObject",
        "properties": {
            "dialogId": {"dataType":"string"},
            "link": {"dataType":"string"},
            "to": {"dataType":"string","required":true},
            "message": {"dataType":"nestedObjectLiteral","nestedProperties":{"sound":{"dataType":"string"},"image":{"dataType":"string"},"description":{"dataType":"string"},"title":{"dataType":"string","required":true}},"required":true},
            "badge": {"dataType":"double"},
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["token"]},{"dataType":"enum","enums":["topic"]}]},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"string"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "FcmTokenDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"double","required":true},
            "userId": {"dataType":"string","required":true},
            "token": {"dataType":"string","required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "FcmTokenRequestDto": {
        "dataType": "refObject",
        "properties": {
            "token": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DialogMembersDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "userId": {"dataType":"string","required":true},
            "dialogId": {"dataType":"string","required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
            "user": {"ref":"IUserDto","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IFileDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "type": {"dataType":"string","required":true},
            "url": {"dataType":"string","required":true},
            "size": {"dataType":"double","required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IDialogMessagesDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "userId": {"dataType":"string","required":true},
            "dialogId": {"dataType":"string","required":true},
            "text": {"dataType":"string","required":true},
            "system": {"dataType":"boolean"},
            "sent": {"dataType":"boolean"},
            "received": {"dataType":"boolean"},
            "replyId": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
            "user": {"ref":"IUserDto","required":true},
            "images": {"dataType":"array","array":{"dataType":"refObject","ref":"IFileDto"}},
            "videos": {"dataType":"array","array":{"dataType":"refObject","ref":"IFileDto"}},
            "audios": {"dataType":"array","array":{"dataType":"refObject","ref":"IFileDto"}},
            "reply": {"ref":"IDialogMessagesDto"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DialogDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "ownerId": {"dataType":"string","required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
            "owner": {"ref":"IUserDto","required":true},
            "members": {"dataType":"array","array":{"dataType":"refObject","ref":"DialogMembersDto"},"required":true},
            "lastMessage": {"dataType":"union","subSchemas":[{"dataType":"array","array":{"dataType":"refObject","ref":"IDialogMessagesDto"}},{"dataType":"enum","enums":[null]}],"required":true},
            "unreadMessagesCount": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IDialogListDto": {
        "dataType": "refObject",
        "properties": {
            "count": {"dataType":"double"},
            "offset": {"dataType":"double"},
            "limit": {"dataType":"double"},
            "data": {"dataType":"array","array":{"dataType":"refObject","ref":"DialogDto"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DialogFindRequestDto": {
        "dataType": "refObject",
        "properties": {
            "recipientId": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DialogCreateRequestDto": {
        "dataType": "refObject",
        "properties": {
            "recipientId": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DialogMembersAddRequestDto": {
        "dataType": "refObject",
        "properties": {
            "dialogId": {"dataType":"string","required":true},
            "members": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IDialogListMessagesDto": {
        "dataType": "refObject",
        "properties": {
            "count": {"dataType":"double"},
            "offset": {"dataType":"double"},
            "limit": {"dataType":"double"},
            "data": {"dataType":"array","array":{"dataType":"refObject","ref":"IDialogMessagesDto"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IMessagesRequestDto": {
        "dataType": "refObject",
        "properties": {
            "dialogId": {"dataType":"string","required":true},
            "text": {"dataType":"string","required":true},
            "system": {"dataType":"boolean"},
            "received": {"dataType":"boolean"},
            "replyId": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "imageIds": {"dataType":"array","array":{"dataType":"string"}},
            "videoIds": {"dataType":"array","array":{"dataType":"string"}},
            "audioIds": {"dataType":"array","array":{"dataType":"string"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IMessagesUpdateRequestDto": {
        "dataType": "refObject",
        "properties": {
            "text": {"dataType":"string"},
            "system": {"dataType":"boolean"},
            "received": {"dataType":"boolean"},
            "replyId": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "imageIds": {"dataType":"array","array":{"dataType":"string"}},
            "videoIds": {"dataType":"array","array":{"dataType":"string"}},
            "audioIds": {"dataType":"array","array":{"dataType":"string"}},
            "deleteFileIds": {"dataType":"array","array":{"dataType":"string"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Base64URLString": {
        "dataType": "refAlias",
        "type": {"dataType":"string","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicKeyCredentialType": {
        "dataType": "refAlias",
        "type": {"dataType":"enum","enums":["public-key"],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AuthenticatorTransportFuture": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["ble"]},{"dataType":"enum","enums":["cable"]},{"dataType":"enum","enums":["hybrid"]},{"dataType":"enum","enums":["internal"]},{"dataType":"enum","enums":["nfc"]},{"dataType":"enum","enums":["smart-card"]},{"dataType":"enum","enums":["usb"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicKeyCredentialDescriptorJSON": {
        "dataType": "refObject",
        "properties": {
            "id": {"ref":"Base64URLString","required":true},
            "type": {"ref":"PublicKeyCredentialType","required":true},
            "transports": {"dataType":"array","array":{"dataType":"refAlias","ref":"AuthenticatorTransportFuture"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UserVerificationRequirement": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["discouraged"]},{"dataType":"enum","enums":["preferred"]},{"dataType":"enum","enums":["required"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AuthenticationExtensionsClientInputs": {
        "dataType": "refObject",
        "properties": {
            "appid": {"dataType":"string"},
            "credProps": {"dataType":"boolean"},
            "hmacCreateSecret": {"dataType":"boolean"},
            "minPinLength": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicKeyCredentialRequestOptionsJSON": {
        "dataType": "refObject",
        "properties": {
            "challenge": {"ref":"Base64URLString","required":true},
            "timeout": {"dataType":"double"},
            "rpId": {"dataType":"string"},
            "allowCredentials": {"dataType":"array","array":{"dataType":"refObject","ref":"PublicKeyCredentialDescriptorJSON"}},
            "userVerification": {"ref":"UserVerificationRequirement"},
            "extensions": {"ref":"AuthenticationExtensionsClientInputs"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "COSEAlgorithmIdentifier": {
        "dataType": "refAlias",
        "type": {"dataType":"double","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AuthenticatorAttestationResponseJSON": {
        "dataType": "refObject",
        "properties": {
            "clientDataJSON": {"ref":"Base64URLString","required":true},
            "attestationObject": {"ref":"Base64URLString","required":true},
            "authenticatorData": {"ref":"Base64URLString"},
            "transports": {"dataType":"array","array":{"dataType":"refAlias","ref":"AuthenticatorTransportFuture"}},
            "publicKeyAlgorithm": {"ref":"COSEAlgorithmIdentifier"},
            "publicKey": {"ref":"Base64URLString"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AuthenticatorAttachment": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["cross-platform"]},{"dataType":"enum","enums":["platform"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CredentialPropertiesOutput": {
        "dataType": "refObject",
        "properties": {
            "rk": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AuthenticationExtensionsClientOutputs": {
        "dataType": "refObject",
        "properties": {
            "appid": {"dataType":"boolean"},
            "credProps": {"ref":"CredentialPropertiesOutput"},
            "hmacCreateSecret": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RegistrationResponseJSON": {
        "dataType": "refObject",
        "properties": {
            "id": {"ref":"Base64URLString","required":true},
            "rawId": {"ref":"Base64URLString","required":true},
            "response": {"ref":"AuthenticatorAttestationResponseJSON","required":true},
            "authenticatorAttachment": {"ref":"AuthenticatorAttachment"},
            "clientExtensionResults": {"ref":"AuthenticationExtensionsClientOutputs","required":true},
            "type": {"ref":"PublicKeyCredentialType","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IVerifyRegistrationRequestDto": {
        "dataType": "refObject",
        "properties": {
            "userId": {"dataType":"string","required":true},
            "data": {"ref":"RegistrationResponseJSON","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IVerifyAuthenticationResponseDto": {
        "dataType": "refObject",
        "properties": {
            "verified": {"dataType":"boolean","required":true},
            "tokens": {"ref":"ITokensDto"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AuthenticatorAssertionResponseJSON": {
        "dataType": "refObject",
        "properties": {
            "clientDataJSON": {"ref":"Base64URLString","required":true},
            "authenticatorData": {"ref":"Base64URLString","required":true},
            "signature": {"ref":"Base64URLString","required":true},
            "userHandle": {"ref":"Base64URLString"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AuthenticationResponseJSON": {
        "dataType": "refObject",
        "properties": {
            "id": {"ref":"Base64URLString","required":true},
            "rawId": {"ref":"Base64URLString","required":true},
            "response": {"ref":"AuthenticatorAssertionResponseJSON","required":true},
            "authenticatorAttachment": {"ref":"AuthenticatorAttachment"},
            "clientExtensionResults": {"ref":"AuthenticationExtensionsClientOutputs","required":true},
            "type": {"ref":"PublicKeyCredentialType","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IVerifyAuthenticationRequestDto": {
        "dataType": "refObject",
        "properties": {
            "userId": {"dataType":"string","required":true},
            "data": {"ref":"AuthenticationResponseJSON","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IProfileDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "firstName": {"dataType":"string"},
            "lastName": {"dataType":"string"},
            "birthDate": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}]},
            "gender": {"dataType":"string"},
            "status": {"dataType":"string"},
            "lastOnline": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}]},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
            "avatar": {"dataType":"union","subSchemas":[{"ref":"IFileDto"},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IProfileUpdateRequestDto": {
        "dataType": "refObject",
        "properties": {
            "firstName": {"dataType":"string"},
            "lastName": {"dataType":"string"},
            "bio": {"dataType":"string"},
            "birthDate": {"dataType":"datetime"},
            "gender": {"dataType":"string"},
            "status": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IProfileListDto": {
        "dataType": "refObject",
        "properties": {
            "count": {"dataType":"double"},
            "offset": {"dataType":"double"},
            "limit": {"dataType":"double"},
            "data": {"dataType":"array","array":{"dataType":"refObject","ref":"IProfileDto"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
};
const validationService = new ValidationService(models);

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

export function RegisterRoutes(router: KoaRouter) {
    // ###########################################################################################################
    //  NOTE: If you do not see routes for all of your controllers in this file, then you might not have informed tsoa of where to look
    //      Please look into the "controllerPathGlobs" config option described in the readme: https://github.com/lukeautry/tsoa
    // ###########################################################################################################
        router.get('/api/user/my',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.getMyUser)),

            async function UserController_getMyUser(context: any, next: any) {
            const args = {
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.getMyUser.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.patch('/api/user/my/update',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.updateMyUser)),

            async function UserController_updateMyUser(context: any, next: any) {
            const args = {
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
                    body: {"in":"body","name":"body","required":true,"ref":"IUserUpdateRequestDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.updateMyUser.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.delete('/api/user/my/delete',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.deleteMyUser)),

            async function UserController_deleteMyUser(context: any, next: any) {
            const args = {
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.deleteMyUser.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.get('/api/user/all',
            authenticateMiddleware([{"jwt":["role:admin"]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.getUsers)),

            async function UserController_getUsers(context: any, next: any) {
            const args = {
                    offset: {"in":"query","name":"offset","dataType":"double"},
                    limit: {"in":"query","name":"limit","dataType":"double"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.getUsers.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.get('/api/user/:id',
            authenticateMiddleware([{"jwt":["role:admin"]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.getUserById)),

            async function UserController_getUserById(context: any, next: any) {
            const args = {
                    id: {"in":"path","name":"id","required":true,"dataType":"string"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.getUserById.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.patch('/api/user/setPrivileges/:id',
            authenticateMiddleware([{"jwt":["role:admin"]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.setPrivileges)),

            async function UserController_setPrivileges(context: any, next: any) {
            const args = {
                    id: {"in":"path","name":"id","required":true,"dataType":"string"},
                    body: {"in":"body","name":"body","required":true,"ref":"IUserPrivilegesRequestDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.setPrivileges.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/user/requestVerifyEmail',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.requestVerifyEmail)),

            async function UserController_requestVerifyEmail(context: any, next: any) {
            const args = {
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.requestVerifyEmail.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.get('/api/user/verifyEmail/:code',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.verifyEmail)),

            async function UserController_verifyEmail(context: any, next: any) {
            const args = {
                    code: {"in":"path","name":"code","required":true,"dataType":"string"},
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.verifyEmail.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.patch('/api/user/update/:id',
            authenticateMiddleware([{"jwt":["role:admin"]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.updateUser)),

            async function UserController_updateUser(context: any, next: any) {
            const args = {
                    id: {"in":"path","name":"id","required":true,"dataType":"string"},
                    body: {"in":"body","name":"body","required":true,"ref":"IUserUpdateRequestDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.updateUser.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/user/changePassword',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.changePassword)),

            async function UserController_changePassword(context: any, next: any) {
            const args = {
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
                    body: {"in":"body","name":"body","required":true,"ref":"IUserChangePasswordDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.changePassword.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.delete('/api/user/delete/:id',
            authenticateMiddleware([{"jwt":["role:admin"]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.deleteUser)),

            async function UserController_deleteUser(context: any, next: any) {
            const args = {
                    id: {"in":"path","name":"id","required":true,"dataType":"string"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.deleteUser.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/auth/sign-up',
            ...(fetchMiddlewares<Middleware>(AuthController)),
            ...(fetchMiddlewares<Middleware>(AuthController.prototype.signUp)),

            async function AuthController_signUp(context: any, next: any) {
            const args = {
                    body: {"in":"body","name":"body","required":true,"ref":"TSignUpRequestDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AuthController>(AuthController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.signUp.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/auth/sign-in',
            ...(fetchMiddlewares<Middleware>(AuthController)),
            ...(fetchMiddlewares<Middleware>(AuthController.prototype.signIn)),

            async function AuthController_signIn(context: any, next: any) {
            const args = {
                    body: {"in":"body","name":"body","required":true,"ref":"ISignInRequestDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AuthController>(AuthController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.signIn.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/auth/authenticate',
            ...(fetchMiddlewares<Middleware>(AuthController)),
            ...(fetchMiddlewares<Middleware>(AuthController.prototype.authenticate)),

            async function AuthController_authenticate(context: any, next: any) {
            const args = {
                    body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"code":{"dataType":"string","required":true}}},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AuthController>(AuthController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.authenticate.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/auth/request-reset-password',
            ...(fetchMiddlewares<Middleware>(AuthController)),
            ...(fetchMiddlewares<Middleware>(AuthController.prototype.requestResetPassword)),

            async function AuthController_requestResetPassword(context: any, next: any) {
            const args = {
                    undefined: {"in":"body","required":true,"ref":"IUserLoginRequestDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AuthController>(AuthController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.requestResetPassword.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/auth/reset-password',
            ...(fetchMiddlewares<Middleware>(AuthController)),
            ...(fetchMiddlewares<Middleware>(AuthController.prototype.resetPassword)),

            async function AuthController_resetPassword(context: any, next: any) {
            const args = {
                    body: {"in":"body","name":"body","required":true,"ref":"IUserResetPasswordRequestDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AuthController>(AuthController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.resetPassword.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/auth/refresh',
            ...(fetchMiddlewares<Middleware>(AuthController)),
            ...(fetchMiddlewares<Middleware>(AuthController.prototype.refresh)),

            async function AuthController_refresh(context: any, next: any) {
            const args = {
                    body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"refreshToken":{"dataType":"string","required":true}}},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AuthController>(AuthController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.refresh.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/biometric/register',
            ...(fetchMiddlewares<Middleware>(BiometricController)),
            ...(fetchMiddlewares<Middleware>(BiometricController.prototype.registerBiometric)),

            async function BiometricController_registerBiometric(context: any, next: any) {
            const args = {
                    body: {"in":"body","name":"body","required":true,"ref":"IRegisterBiometricRequestDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<BiometricController>(BiometricController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.registerBiometric.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/biometric/generate-nonce',
            ...(fetchMiddlewares<Middleware>(BiometricController)),
            ...(fetchMiddlewares<Middleware>(BiometricController.prototype.generateNonce)),

            async function BiometricController_generateNonce(context: any, next: any) {
            const args = {
                    body: {"in":"body","name":"body","required":true,"ref":"IGenerateNonceRequestDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<BiometricController>(BiometricController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.generateNonce.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/biometric/verify-signature',
            ...(fetchMiddlewares<Middleware>(BiometricController)),
            ...(fetchMiddlewares<Middleware>(BiometricController.prototype.verifySignature)),

            async function BiometricController_verifySignature(context: any, next: any) {
            const args = {
                    body: {"in":"body","name":"body","required":true,"ref":"IVerifyBiometricSignatureRequestDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<BiometricController>(BiometricController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.verifySignature.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/fcm/register-apn-token',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(FcmTokenController)),
            ...(fetchMiddlewares<Middleware>(FcmTokenController.prototype.registerApn)),

            async function FcmTokenController_registerApn(context: any, next: any) {
            const args = {
                    body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"sandbox":{"dataType":"boolean","required":true},"application":{"dataType":"string","required":true},"apns_tokens":{"dataType":"array","array":{"dataType":"string"},"required":true}}},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<FcmTokenController>(FcmTokenController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.registerApn.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/fcm/push',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(FcmTokenController)),
            ...(fetchMiddlewares<Middleware>(FcmTokenController.prototype.sendPushNotification)),

            async function FcmTokenController_sendPushNotification(context: any, next: any) {
            const args = {
                    message: {"in":"body","name":"message","required":true,"ref":"IFCMMessageDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<FcmTokenController>(FcmTokenController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.sendPushNotification.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.get('/api/fcm/tokens',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(FcmTokenController)),
            ...(fetchMiddlewares<Middleware>(FcmTokenController.prototype.getTokens)),

            async function FcmTokenController_getTokens(context: any, next: any) {
            const args = {
                    userId: {"in":"query","name":"userId","required":true,"dataType":"string"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<FcmTokenController>(FcmTokenController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.getTokens.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.get('/api/fcm/my-tokens',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(FcmTokenController)),
            ...(fetchMiddlewares<Middleware>(FcmTokenController.prototype.getMyTokens)),

            async function FcmTokenController_getMyTokens(context: any, next: any) {
            const args = {
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<FcmTokenController>(FcmTokenController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.getMyTokens.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.delete('/api/fcm/my-tokens',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(FcmTokenController)),
            ...(fetchMiddlewares<Middleware>(FcmTokenController.prototype.deleteTokens)),

            async function FcmTokenController_deleteTokens(context: any, next: any) {
            const args = {
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<FcmTokenController>(FcmTokenController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.deleteTokens.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.get('/api/fcm/token/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(FcmTokenController)),
            ...(fetchMiddlewares<Middleware>(FcmTokenController.prototype.getToken)),

            async function FcmTokenController_getToken(context: any, next: any) {
            const args = {
                    id: {"in":"path","name":"id","required":true,"dataType":"double"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<FcmTokenController>(FcmTokenController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.getToken.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/fcm/token',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(FcmTokenController)),
            ...(fetchMiddlewares<Middleware>(FcmTokenController.prototype.addToken)),

            async function FcmTokenController_addToken(context: any, next: any) {
            const args = {
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
                    undefined: {"in":"body","required":true,"ref":"FcmTokenRequestDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<FcmTokenController>(FcmTokenController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.addToken.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.delete('/api/fcm/token/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(FcmTokenController)),
            ...(fetchMiddlewares<Middleware>(FcmTokenController.prototype.deleteToken)),

            async function FcmTokenController_deleteToken(context: any, next: any) {
            const args = {
                    id: {"in":"path","name":"id","required":true,"dataType":"double"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<FcmTokenController>(FcmTokenController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.deleteToken.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.get('/api/dialog/unread-messages-count',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(DialogController)),
            ...(fetchMiddlewares<Middleware>(DialogController.prototype.getUnreadMessagesCount)),

            async function DialogController_getUnreadMessagesCount(context: any, next: any) {
            const args = {
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
                    dialogId: {"in":"query","name":"dialogId","dataType":"string"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<DialogController>(DialogController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.getUnreadMessagesCount.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.get('/api/dialog/all',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(DialogController)),
            ...(fetchMiddlewares<Middleware>(DialogController.prototype.getDialogs)),

            async function DialogController_getDialogs(context: any, next: any) {
            const args = {
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
                    offset: {"in":"query","name":"offset","dataType":"double"},
                    limit: {"in":"query","name":"limit","dataType":"double"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<DialogController>(DialogController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.getDialogs.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.get('/api/dialog/info/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(DialogController)),
            ...(fetchMiddlewares<Middleware>(DialogController.prototype.getDialogById)),

            async function DialogController_getDialogById(context: any, next: any) {
            const args = {
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
                    id: {"in":"path","name":"id","required":true,"dataType":"string"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<DialogController>(DialogController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.getDialogById.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/dialog/find',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(DialogController)),
            ...(fetchMiddlewares<Middleware>(DialogController.prototype.findDialog)),

            async function DialogController_findDialog(context: any, next: any) {
            const args = {
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
                    body: {"in":"body","name":"body","required":true,"ref":"DialogFindRequestDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<DialogController>(DialogController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.findDialog.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/dialog',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(DialogController)),
            ...(fetchMiddlewares<Middleware>(DialogController.prototype.createDialog)),

            async function DialogController_createDialog(context: any, next: any) {
            const args = {
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
                    body: {"in":"body","name":"body","required":true,"ref":"DialogCreateRequestDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<DialogController>(DialogController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.createDialog.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.get('/api/dialog/members',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(DialogController)),
            ...(fetchMiddlewares<Middleware>(DialogController.prototype.getMembers)),

            async function DialogController_getMembers(context: any, next: any) {
            const args = {
                    dialogId: {"in":"query","name":"dialogId","required":true,"dataType":"string"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<DialogController>(DialogController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.getMembers.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/dialog/member',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(DialogController)),
            ...(fetchMiddlewares<Middleware>(DialogController.prototype.addMembers)),

            async function DialogController_addMembers(context: any, next: any) {
            const args = {
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
                    body: {"in":"body","name":"body","required":true,"ref":"DialogMembersAddRequestDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<DialogController>(DialogController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.addMembers.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.delete('/api/dialog/member/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(DialogController)),
            ...(fetchMiddlewares<Middleware>(DialogController.prototype.deleteMember)),

            async function DialogController_deleteMember(context: any, next: any) {
            const args = {
                    id: {"in":"path","name":"id","required":true,"dataType":"string"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<DialogController>(DialogController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.deleteMember.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.delete('/api/dialog/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(DialogController)),
            ...(fetchMiddlewares<Middleware>(DialogController.prototype.removeDialog)),

            async function DialogController_removeDialog(context: any, next: any) {
            const args = {
                    id: {"in":"path","name":"id","required":true,"dataType":"string"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<DialogController>(DialogController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.removeDialog.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.get('/api/dialog/message/all',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(DialogController)),
            ...(fetchMiddlewares<Middleware>(DialogController.prototype.getMessages)),

            async function DialogController_getMessages(context: any, next: any) {
            const args = {
                    dialogId: {"in":"query","name":"dialogId","required":true,"dataType":"string"},
                    offset: {"in":"query","name":"offset","dataType":"double"},
                    limit: {"in":"query","name":"limit","dataType":"double"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<DialogController>(DialogController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.getMessages.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.get('/api/dialog/message/last-message',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(DialogController)),
            ...(fetchMiddlewares<Middleware>(DialogController.prototype.getLastMessage)),

            async function DialogController_getLastMessage(context: any, next: any) {
            const args = {
                    dialogId: {"in":"query","name":"dialogId","required":true,"dataType":"string"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<DialogController>(DialogController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.getLastMessage.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.get('/api/dialog/message/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(DialogController)),
            ...(fetchMiddlewares<Middleware>(DialogController.prototype.getMessageById)),

            async function DialogController_getMessageById(context: any, next: any) {
            const args = {
                    id: {"in":"path","name":"id","required":true,"dataType":"string"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<DialogController>(DialogController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.getMessageById.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/dialog/message',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(DialogController)),
            ...(fetchMiddlewares<Middleware>(DialogController.prototype.newMessage)),

            async function DialogController_newMessage(context: any, next: any) {
            const args = {
                    message: {"in":"body","name":"message","required":true,"ref":"IMessagesRequestDto"},
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<DialogController>(DialogController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.newMessage.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.patch('/api/dialog/message/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(DialogController)),
            ...(fetchMiddlewares<Middleware>(DialogController.prototype.updateMessage)),

            async function DialogController_updateMessage(context: any, next: any) {
            const args = {
                    id: {"in":"path","name":"id","required":true,"dataType":"string"},
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
                    body: {"in":"body","name":"body","required":true,"ref":"IMessagesUpdateRequestDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<DialogController>(DialogController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.updateMessage.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.delete('/api/dialog/message/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(DialogController)),
            ...(fetchMiddlewares<Middleware>(DialogController.prototype.deleteMessage)),

            async function DialogController_deleteMessage(context: any, next: any) {
            const args = {
                    id: {"in":"path","name":"id","required":true,"dataType":"string"},
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<DialogController>(DialogController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.deleteMessage.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.get('/api/file',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(FileController)),
            ...(fetchMiddlewares<Middleware>(FileController.prototype.getFileById)),

            async function FileController_getFileById(context: any, next: any) {
            const args = {
                    id: {"in":"query","name":"id","required":true,"dataType":"string"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<FileController>(FileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.getFileById.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/file',
            authenticateMiddleware([{"jwt":[]}]),
            upload.single('file'),
            ...(fetchMiddlewares<Middleware>(FileController)),
            ...(fetchMiddlewares<Middleware>(FileController.prototype.uploadFile)),

            async function FileController_uploadFile(context: any, next: any) {
            const args = {
                    file: {"in":"formData","name":"file","required":true,"dataType":"file"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<FileController>(FileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.uploadFile.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.delete('/api/file/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(FileController)),
            ...(fetchMiddlewares<Middleware>(FileController.prototype.deleteFile)),

            async function FileController_deleteFile(context: any, next: any) {
            const args = {
                    id: {"in":"path","name":"id","required":true,"dataType":"string"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<FileController>(FileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.deleteFile.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/passkeys/generate-registration-options',
            ...(fetchMiddlewares<Middleware>(PasskeysController)),
            ...(fetchMiddlewares<Middleware>(PasskeysController.prototype.generateRegistrationOptions)),

            async function PasskeysController_generateRegistrationOptions(context: any, next: any) {
            const args = {
                    undefined: {"in":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"userId":{"dataType":"string","required":true}}},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<PasskeysController>(PasskeysController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.generateRegistrationOptions.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/passkeys/verify-registration',
            ...(fetchMiddlewares<Middleware>(PasskeysController)),
            ...(fetchMiddlewares<Middleware>(PasskeysController.prototype.verifyRegistration)),

            async function PasskeysController_verifyRegistration(context: any, next: any) {
            const args = {
                    undefined: {"in":"body","required":true,"ref":"IVerifyRegistrationRequestDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<PasskeysController>(PasskeysController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.verifyRegistration.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/passkeys/generate-authentication-options',
            ...(fetchMiddlewares<Middleware>(PasskeysController)),
            ...(fetchMiddlewares<Middleware>(PasskeysController.prototype.generateAuthenticationOptions)),

            async function PasskeysController_generateAuthenticationOptions(context: any, next: any) {
            const args = {
                    undefined: {"in":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"userId":{"dataType":"string","required":true}}},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<PasskeysController>(PasskeysController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.generateAuthenticationOptions.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/passkeys/verify-authentication',
            ...(fetchMiddlewares<Middleware>(PasskeysController)),
            ...(fetchMiddlewares<Middleware>(PasskeysController.prototype.verifyAuthentication)),

            async function PasskeysController_verifyAuthentication(context: any, next: any) {
            const args = {
                    undefined: {"in":"body","required":true,"ref":"IVerifyAuthenticationRequestDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<PasskeysController>(PasskeysController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.verifyAuthentication.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.get('/api/profile/my',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(ProfileController)),
            ...(fetchMiddlewares<Middleware>(ProfileController.prototype.getMyProfile)),

            async function ProfileController_getMyProfile(context: any, next: any) {
            const args = {
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ProfileController>(ProfileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.getMyProfile.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.patch('/api/profile/my/update',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(ProfileController)),
            ...(fetchMiddlewares<Middleware>(ProfileController.prototype.updateMyProfile)),

            async function ProfileController_updateMyProfile(context: any, next: any) {
            const args = {
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
                    body: {"in":"body","name":"body","required":true,"ref":"IProfileUpdateRequestDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ProfileController>(ProfileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.updateMyProfile.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.delete('/api/profile/my/delete',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(ProfileController)),
            ...(fetchMiddlewares<Middleware>(ProfileController.prototype.deleteMyProfile)),

            async function ProfileController_deleteMyProfile(context: any, next: any) {
            const args = {
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ProfileController>(ProfileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.deleteMyProfile.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.get('/api/profile/all',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(ProfileController)),
            ...(fetchMiddlewares<Middleware>(ProfileController.prototype.getProfiles)),

            async function ProfileController_getProfiles(context: any, next: any) {
            const args = {
                    offset: {"in":"query","name":"offset","dataType":"double"},
                    limit: {"in":"query","name":"limit","dataType":"double"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ProfileController>(ProfileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.getProfiles.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.get('/api/profile/:userId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(ProfileController)),
            ...(fetchMiddlewares<Middleware>(ProfileController.prototype.getProfileById)),

            async function ProfileController_getProfileById(context: any, next: any) {
            const args = {
                    userId: {"in":"path","name":"userId","required":true,"dataType":"string"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ProfileController>(ProfileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.getProfileById.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.patch('/api/profile/update/:userId',
            authenticateMiddleware([{"jwt":["role:admin"]}]),
            ...(fetchMiddlewares<Middleware>(ProfileController)),
            ...(fetchMiddlewares<Middleware>(ProfileController.prototype.updateProfile)),

            async function ProfileController_updateProfile(context: any, next: any) {
            const args = {
                    userId: {"in":"path","name":"userId","required":true,"dataType":"string"},
                    body: {"in":"body","name":"body","required":true,"ref":"IProfileUpdateRequestDto"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ProfileController>(ProfileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.updateProfile.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.post('/api/profile/avatar/upload',
            authenticateMiddleware([{"jwt":[]}]),
            upload.single('file'),
            ...(fetchMiddlewares<Middleware>(ProfileController)),
            ...(fetchMiddlewares<Middleware>(ProfileController.prototype.addAvatar)),

            async function ProfileController_addAvatar(context: any, next: any) {
            const args = {
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
                    file: {"in":"formData","name":"file","required":true,"dataType":"file"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ProfileController>(ProfileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.addAvatar.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.delete('/api/profile/avatar',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(ProfileController)),
            ...(fetchMiddlewares<Middleware>(ProfileController.prototype.removeAvatar)),

            async function ProfileController_removeAvatar(context: any, next: any) {
            const args = {
                    req: {"in":"request","name":"req","required":true,"dataType":"object"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ProfileController>(ProfileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.removeAvatar.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        router.delete('/api/profile/delete/:userId',
            authenticateMiddleware([{"jwt":["role:admin"]}]),
            ...(fetchMiddlewares<Middleware>(ProfileController)),
            ...(fetchMiddlewares<Middleware>(ProfileController.prototype.deleteProfile)),

            async function ProfileController_deleteProfile(context: any, next: any) {
            const args = {
                    userId: {"in":"path","name":"userId","required":true,"dataType":"string"},
            };

            let validatedArgs: any[] = [];
            try {
              validatedArgs = getValidatedArgs(args, context, next);
            } catch (err) {
              const error = err as any;
              context.status = error.status;
              context.throw(error.status, JSON.stringify({ fields: error.fields }));
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ProfileController>(ProfileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            const promise = controller.deleteProfile.apply(controller, validatedArgs as any);
            return promiseHandler(controller, promise, context, undefined, undefined);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa


    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    function authenticateMiddleware(security: TsoaRoute.Security[] = []) {
        return async function runAuthenticationMiddleware(context: any, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            // keep track of failed auth attempts so we can hand back the most
            // recent one.  This behavior was previously existing so preserving it
            // here
            const failedAttempts: any[] = [];
            const pushAndRethrow = (error: any) => {
                failedAttempts.push(error);
                throw error;
            };

            const secMethodOrPromises: Promise<any>[] = [];
            for (const secMethod of security) {
                if (Object.keys(secMethod).length > 1) {
                    const secMethodAndPromises: Promise<any>[] = [];

                    for (const name in secMethod) {
                        secMethodAndPromises.push(
                            koaAuthentication(context.request, name, secMethod[name])
                                .catch(pushAndRethrow)
                        );
                    }

                    secMethodOrPromises.push(Promise.all(secMethodAndPromises)
                        .then(users => { return users[0]; }));
                } else {
                    for (const name in secMethod) {
                        secMethodOrPromises.push(
                            koaAuthentication(context.request, name, secMethod[name])
                                .catch(pushAndRethrow)
                        );
                    }
                }
            }

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let success;
            try {
                const user = await promiseAny(secMethodOrPromises);
                success = true;
                context.request['user'] = user;
            }
            catch(err) {
                // Show most recent error as response
                const error = failedAttempts.pop();
                context.status = error.status || 401;
                context.throw(context.status, error.message, error);
            }

            if (success) {
                await next();
            }

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        }
    }

  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

  function isController(object: any): object is Controller {
      return 'getHeaders' in object && 'getStatus' in object && 'setStatus' in object;
  }

  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

  function promiseHandler(controllerObj: any, promise: Promise<any>, context: any, successStatus: any, next?: () => Promise<any>) {
      return Promise.resolve(promise)
        .then((data: any) => {
            let statusCode = successStatus;
            let headers;

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            if (isController(controllerObj)) {
                headers = controllerObj.getHeaders();
                statusCode = controllerObj.getStatus() || statusCode;
            }
            return returnHandler(context, next, statusCode, data, headers);
        })
        .catch((error: any) => {
            context.status = error.status || 500;
            context.throw(context.status, error.message, error);
        });
    }

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    function returnHandler(context: any, next?: () => any, statusCode?: number, data?: any, headers: any={}) {
        if (!context.headerSent && !context.response.__tsoaResponded) {
            if (data !== null && data !== undefined) {
                context.body = data;
                context.status = 200;
            } else {
                context.status = 204;
            }

            if (statusCode) {
                context.status = statusCode;
            }

            context.set(headers);
            context.response.__tsoaResponded = true;
            return next ? next() : context;
        }
    }

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    function getValidatedArgs(args: any, context: any, next: () => any): any[] {
        const errorFields: FieldErrors = {};
        const values = Object.keys(args).map(key => {
            const name = args[key].name;
            switch (args[key].in) {
            case 'request':
                return context.request;
            case 'query':
                return validationService.ValidateParam(args[key], context.request.query[name], name, errorFields, undefined, {"noImplicitAdditionalProperties":"silently-remove-extras"});
            case 'path':
                return validationService.ValidateParam(args[key], context.params[name], name, errorFields, undefined, {"noImplicitAdditionalProperties":"silently-remove-extras"});
            case 'header':
                return validationService.ValidateParam(args[key], context.request.headers[name], name, errorFields, undefined, {"noImplicitAdditionalProperties":"silently-remove-extras"});
            case 'body':
                return validationService.ValidateParam(args[key], context.request.body, name, errorFields, undefined, {"noImplicitAdditionalProperties":"silently-remove-extras"});
            case 'body-prop':
                return validationService.ValidateParam(args[key], context.request.body[name], name, errorFields, 'body.', {"noImplicitAdditionalProperties":"silently-remove-extras"});
            case 'formData':
                if (args[key].dataType === 'file') {
                  return validationService.ValidateParam(args[key], context.request.file, name, errorFields, undefined, {"noImplicitAdditionalProperties":"silently-remove-extras"});
                } else if (args[key].dataType === 'array' && args[key].array.dataType === 'file') {
                  return validationService.ValidateParam(args[key], context.request.files, name, errorFields, undefined, {"noImplicitAdditionalProperties":"silently-remove-extras"});
                } else {
                  return validationService.ValidateParam(args[key], context.request.body[name], name, errorFields, undefined, {"noImplicitAdditionalProperties":"silently-remove-extras"});
                }
            case 'res':
                return responder(context, next);
            }
        });
        if (Object.keys(errorFields).length > 0) {
            throw new ValidateError(errorFields, '');
        }
        return values;
    }

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    function responder(context: any, next: () => any): TsoaResponse<HttpStatusCodeLiteral, unknown>  {
        return function(status, data, headers) {
           returnHandler(context, next, status, data, headers);
        };
    };

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
}

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
