/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from '@tsoa/runtime';
import { fetchMiddlewares, KoaTemplateService } from '@tsoa/runtime';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { PermissionController } from './../modules/permission/permission.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { FileController } from './../modules/file/file.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ProfileController } from './../modules/profile/profile.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { RoleController } from './../modules/role/role.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { UserController } from './../modules/user/user.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { SessionController } from './../modules/session/session.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AuthController } from './../modules/auth/auth.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { PasskeysController } from './../modules/passkeys/passkeys.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { JobsController } from './../modules/jobs/jobs.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { BiometricController } from './../modules/biometric/biometric.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AuditController } from './../modules/audit/audit.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ApiKeyController } from './../modules/api-key/api-key.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AgentController } from './../modules/agent/agent.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AgentReleaseController } from './../modules/agent/agent-release.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AgentLinkController } from './../modules/agent/agent-link.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AgentEnrollmentTokenController } from './../modules/agent/agent-enrollment.controller';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AgentCommandController } from './../modules/agent/agent-command.controller';
import { koaAuthentication } from './../core/auth/koa-authentication';
// @ts-ignore - no great way to install types from subpackage
import { iocContainer } from './../app.container';
import type { IocContainer, IocContainerFactory } from '@tsoa/runtime';
import type { Context, Next, Middleware, Request as KRequest, Response as KResponse } from 'koa';
import type * as KoaRouter from '@koa/router';
const multer = require('@koa/multer');
const koaAuthenticationRecasted = koaAuthentication as (req: KRequest, securityName: string, scopes?: string[], res?: KResponse) => Promise<any>;


// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
    "IErrorResponseDto": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"double","required":true},
            "code": {"dataType":"string","required":true},
            "message": {"dataType":"string","required":true},
            "details": {"dataType":"any"},
            "requestId": {"dataType":"string"},
            "stack": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TPermission": {
        "dataType": "refAlias",
        "type": {"dataType":"string","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IPermissionCatalogItemDto": {
        "dataType": "refObject",
        "properties": {
            "name": {"ref":"TPermission","required":true},
            "label": {"dataType":"string","required":true},
            "own": {"ref":"TPermission"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IPermissionCatalogGroupDto": {
        "dataType": "refObject",
        "properties": {
            "key": {"dataType":"string","required":true},
            "label": {"dataType":"string","required":true},
            "permissions": {"dataType":"array","array":{"dataType":"refObject","ref":"IPermissionCatalogItemDto"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IPermissionCatalogDto": {
        "dataType": "refObject",
        "properties": {
            "groups": {"dataType":"array","array":{"dataType":"refObject","ref":"IPermissionCatalogGroupDto"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EFileStatus": {
        "dataType": "refEnum",
        "enums": ["pending","processing","ready","failed"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IFileDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "ownerId": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "name": {"dataType":"string","required":true},
            "type": {"dataType":"string","required":true},
            "size": {"dataType":"double","required":true},
            "status": {"ref":"EFileStatus","required":true},
            "url": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "downloadUrl": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "thumbnailUrl": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "mediumUrl": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "blurhash": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "width": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "height": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "duration": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "waveform": {"dataType":"union","subSchemas":[{"dataType":"array","array":{"dataType":"double"}},{"dataType":"enum","enums":[null]}],"required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IPaginatedDto_IFileDto_": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"IFileDto"},"required":true},
            "total": {"dataType":"double","required":true},
            "offset": {"dataType":"double","required":true},
            "limit": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UUID": {
        "dataType": "refAlias",
        "type": {"dataType":"string","validators":{"pattern":{"errorMsg":"Некорректный UUID","value":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"}}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.string_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"string"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IDirectUploadDto": {
        "dataType": "refObject",
        "properties": {
            "fileId": {"dataType":"string","required":true},
            "uploadUrl": {"dataType":"string","required":true},
            "headers": {"ref":"Record_string.string_","required":true},
            "expiresAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ICreateUploadBody": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "size": {"dataType":"double","required":true},
            "contentType": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProfileDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "userId": {"dataType":"string","required":true},
            "firstName": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "lastName": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "birthDate": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "gender": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "locale": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "lastOnline": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
            "avatar": {"ref":"IFileDto"},
            "user": {"ref":"UserDto"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "KnownRole": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["admin"]},{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["guest"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TRole": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"ref":"KnownRole"},{"dataType":"intersection","subSchemas":[{"dataType":"string"},{"dataType":"nestedObjectLiteral","nestedProperties":{}}]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IPermissionDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"ref":"TPermission","required":true},
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
            "name": {"ref":"TRole","required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
            "permissions": {"dataType":"array","array":{"dataType":"refObject","ref":"IPermissionDto"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UserDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "email": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "emailVerified": {"dataType":"boolean"},
            "phone": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "username": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "profile": {"ref":"ProfileDto"},
            "roles": {"dataType":"array","array":{"dataType":"refObject","ref":"IRoleDto"},"required":true},
            "directPermissions": {"dataType":"array","array":{"dataType":"refObject","ref":"IPermissionDto"},"required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IProfileUpdateRequestDto": {
        "dataType": "refObject",
        "properties": {
            "firstName": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"validators":{"maxLength":{"value":40}}},
            "lastName": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"validators":{"maxLength":{"value":40}}},
            "birthDate": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}]},
            "gender": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"validators":{"maxLength":{"value":20}}},
            "locale": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"validators":{"maxLength":{"value":10}}},
            "avatarId": {"dataType":"union","subSchemas":[{"ref":"UUID"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EPrivacyLevel": {
        "dataType": "refEnum",
        "enums": ["everyone","contacts","nobody"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PrivacySettingsDto": {
        "dataType": "refObject",
        "properties": {
            "showLastOnline": {"ref":"EPrivacyLevel","required":true},
            "showPhone": {"ref":"EPrivacyLevel","required":true},
            "showAvatar": {"ref":"EPrivacyLevel","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicProfileDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "userId": {"dataType":"string","required":true},
            "firstName": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "lastName": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "lastOnline": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "avatarUrl": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IProfileListDto": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"PublicProfileDto"},"required":true},
            "total": {"dataType":"double","required":true},
            "offset": {"dataType":"double","required":true},
            "limit": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RoleName": {
        "dataType": "refAlias",
        "type": {"dataType":"string","validators":{"minLength":{"value":1},"maxLength":{"value":100}}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ICreateRoleRequestDto": {
        "dataType": "refObject",
        "properties": {
            "name": {"ref":"RoleName","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PermissionName": {
        "dataType": "refAlias",
        "type": {"dataType":"string","validators":{"minLength":{"value":1},"maxLength":{"value":100}}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IRolePermissionsRequestDto": {
        "dataType": "refObject",
        "properties": {
            "permissions": {"dataType":"array","array":{"dataType":"refAlias","ref":"PermissionName"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUserUpdateRequestDto": {
        "dataType": "refObject",
        "properties": {
            "email": {"dataType":"string"},
            "phone": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUserConfirmEmailChangeDto": {
        "dataType": "refObject",
        "properties": {
            "code": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUserDeleteDto": {
        "dataType": "refObject",
        "properties": {
            "password": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicUserDto": {
        "dataType": "refObject",
        "properties": {
            "userId": {"dataType":"string","required":true},
            "username": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "phone": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "profile": {"ref":"PublicProfileDto"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUserListDto": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"PublicUserDto"},"required":true},
            "total": {"dataType":"double","required":true},
            "offset": {"dataType":"double","required":true},
            "limit": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUserAdminListDto": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"UserDto"},"required":true},
            "total": {"dataType":"double","required":true},
            "offset": {"dataType":"double","required":true},
            "limit": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUserOptionDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUserOptionsDto": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"array","array":{"dataType":"refObject","ref":"IUserOptionDto"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUserPrivilegesRequestDto": {
        "dataType": "refObject",
        "properties": {
            "roles": {"dataType":"array","array":{"dataType":"refAlias","ref":"RoleName"},"required":true},
            "permissions": {"dataType":"array","array":{"dataType":"refAlias","ref":"PermissionName"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUserVerifyEmailDto": {
        "dataType": "refObject",
        "properties": {
            "code": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUserChangePasswordDto": {
        "dataType": "refObject",
        "properties": {
            "currentPassword": {"dataType":"string","required":true},
            "newPassword": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SessionDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "userId": {"dataType":"string","required":true},
            "deviceName": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "deviceType": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "ip": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "userAgent": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "lastActiveAt": {"dataType":"datetime","required":true},
            "expiresAt": {"dataType":"datetime","required":true},
            "createdAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IPaginatedDto_SessionDto_": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"SessionDto"},"required":true},
            "total": {"dataType":"double","required":true},
            "offset": {"dataType":"double","required":true},
            "limit": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ITokensDto": {
        "dataType": "refObject",
        "properties": {
            "accessToken": {"dataType":"string","required":true},
            "refreshToken": {"dataType":"string","required":true},
            "expiresIn": {"dataType":"double","required":true},
            "sessionId": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUserWithTokensDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "email": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "emailVerified": {"dataType":"boolean"},
            "phone": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "username": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "profile": {"ref":"ProfileDto"},
            "roles": {"dataType":"array","array":{"dataType":"refObject","ref":"IRoleDto"},"required":true},
            "directPermissions": {"dataType":"array","array":{"dataType":"refObject","ref":"IPermissionDto"},"required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
            "tokens": {"ref":"ITokensDto","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TSignUpRequestDto": {
        "dataType": "refAlias",
        "type": {"dataType":"intersection","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"password":{"dataType":"string","required":true},"lastName":{"dataType":"string"},"firstName":{"dataType":"string"}}},{"dataType":"union","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"phone":{"dataType":"string","required":true},"email":{"dataType":"string"}}},{"dataType":"nestedObjectLiteral","nestedProperties":{"phone":{"dataType":"string"},"email":{"dataType":"string","required":true}}}]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "I2FARequiredDto": {
        "dataType": "refObject",
        "properties": {
            "require2FA": {"dataType":"enum","enums":[true],"required":true},
            "twoFactorToken": {"dataType":"string","required":true},
            "twoFactorHint": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ISignInResponseDto": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"ref":"IUserWithTokensDto"},{"ref":"I2FARequiredDto"}],"validators":{}},
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
    "ApiResponseDto": {
        "dataType": "refObject",
        "properties": {
            "message": {"dataType":"string"},
            "data": {"dataType":"any"},
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
            "token": {"dataType":"string","required":true},
            "password": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IRefreshRequestDto": {
        "dataType": "refObject",
        "properties": {
            "refreshToken": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IEnable2FARequestDto": {
        "dataType": "refObject",
        "properties": {
            "currentPassword": {"dataType":"string","required":true},
            "password": {"dataType":"string","required":true},
            "hint": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IDisable2FARequestDto": {
        "dataType": "refObject",
        "properties": {
            "currentPassword": {"dataType":"string","required":true},
            "password": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IVerify2FARequestDto": {
        "dataType": "refObject",
        "properties": {
            "twoFactorToken": {"dataType":"string","required":true},
            "password": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PasskeyDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "deviceType": {"dataType":"string","required":true},
            "transports": {"dataType":"union","subSchemas":[{"dataType":"array","array":{"dataType":"string"}},{"dataType":"enum","enums":[null]}],"required":true},
            "lastUsed": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "createdAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IPaginatedDto_PasskeyDto_": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"PasskeyDto"},"required":true},
            "total": {"dataType":"double","required":true},
            "offset": {"dataType":"double","required":true},
            "limit": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicKeyCredentialRpEntity": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "id": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicKeyCredentialUserEntityJSON": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "displayName": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Base64URLString": {
        "dataType": "refAlias",
        "type": {"dataType":"string","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "COSEAlgorithmIdentifier": {
        "dataType": "refAlias",
        "type": {"dataType":"double","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicKeyCredentialType": {
        "dataType": "refAlias",
        "type": {"dataType":"enum","enums":["public-key"],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicKeyCredentialParameters": {
        "dataType": "refObject",
        "properties": {
            "alg": {"ref":"COSEAlgorithmIdentifier","required":true},
            "type": {"ref":"PublicKeyCredentialType","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicKeyCredentialDescriptorJSON": {
        "dataType": "refObject",
        "properties": {
            "id": {"ref":"Base64URLString","required":true},
            "type": {"dataType":"string","required":true},
            "transports": {"dataType":"array","array":{"dataType":"string"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AuthenticatorAttachment": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["cross-platform"]},{"dataType":"enum","enums":["platform"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ResidentKeyRequirement": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["discouraged"]},{"dataType":"enum","enums":["preferred"]},{"dataType":"enum","enums":["required"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UserVerificationRequirement": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["discouraged"]},{"dataType":"enum","enums":["preferred"]},{"dataType":"enum","enums":["required"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AuthenticatorSelectionCriteria": {
        "dataType": "refObject",
        "properties": {
            "authenticatorAttachment": {"ref":"AuthenticatorAttachment"},
            "requireResidentKey": {"dataType":"boolean"},
            "residentKey": {"ref":"ResidentKeyRequirement"},
            "userVerification": {"ref":"UserVerificationRequirement"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AttestationConveyancePreference": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["direct"]},{"dataType":"enum","enums":["enterprise"]},{"dataType":"enum","enums":["indirect"]},{"dataType":"enum","enums":["none"]}],"validators":{}},
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
    "PublicKeyCredentialCreationOptionsJSON": {
        "dataType": "refObject",
        "properties": {
            "rp": {"ref":"PublicKeyCredentialRpEntity","required":true},
            "user": {"ref":"PublicKeyCredentialUserEntityJSON","required":true},
            "challenge": {"ref":"Base64URLString","required":true},
            "pubKeyCredParams": {"dataType":"array","array":{"dataType":"refObject","ref":"PublicKeyCredentialParameters"},"required":true},
            "timeout": {"dataType":"double"},
            "excludeCredentials": {"dataType":"array","array":{"dataType":"refObject","ref":"PublicKeyCredentialDescriptorJSON"}},
            "authenticatorSelection": {"ref":"AuthenticatorSelectionCriteria"},
            "hints": {"dataType":"array","array":{"dataType":"string"}},
            "attestation": {"ref":"AttestationConveyancePreference"},
            "attestationFormats": {"dataType":"array","array":{"dataType":"string"}},
            "extensions": {"ref":"AuthenticationExtensionsClientInputs"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IVerifyRegistrationResponseDto": {
        "dataType": "refObject",
        "properties": {
            "verified": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AuthenticatorTransportFuture": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["ble"]},{"dataType":"enum","enums":["cable"]},{"dataType":"enum","enums":["hybrid"]},{"dataType":"enum","enums":["internal"]},{"dataType":"enum","enums":["nfc"]},{"dataType":"enum","enums":["smart-card"]},{"dataType":"enum","enums":["usb"]}],"validators":{}},
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
            "data": {"ref":"RegistrationResponseJSON","required":true},
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
            "hints": {"dataType":"array","array":{"dataType":"string"}},
            "extensions": {"ref":"AuthenticationExtensionsClientInputs"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IGenerateAuthenticationOptionsRequestDto": {
        "dataType": "refObject",
        "properties": {
            "login": {"dataType":"string","required":true},
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
            "data": {"ref":"AuthenticationResponseJSON","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EJobRunStatus": {
        "dataType": "refEnum",
        "enums": ["queued","running","completed","failed","cancelled"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IJobRunError": {
        "dataType": "refObject",
        "properties": {
            "code": {"dataType":"string","required":true},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "JobRunDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "queue": {"dataType":"string","required":true},
            "status": {"ref":"EJobRunStatus","required":true},
            "title": {"dataType":"string","required":true},
            "progress": {"dataType":"double","required":true},
            "progressText": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "logTail": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "result": {"dataType":"any","required":true},
            "error": {"dataType":"union","subSchemas":[{"ref":"IJobRunError"},{"dataType":"enum","enums":[null]}],"required":true},
            "ownerId": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "scopeType": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "scopeId": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "attempt": {"dataType":"double","required":true},
            "cancelRequested": {"dataType":"boolean","required":true},
            "stopRequested": {"dataType":"boolean","required":true},
            "agentId": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "startedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "finishedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "createdAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IPaginatedDto_JobRunDto_": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"JobRunDto"},"required":true},
            "total": {"dataType":"double","required":true},
            "offset": {"dataType":"double","required":true},
            "limit": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IDemoEchoData": {
        "dataType": "refObject",
        "properties": {
            "text": {"dataType":"string","required":true},
            "inputKey": {"dataType":"string"},
            "withOutput": {"dataType":"boolean"},
            "sleep": {"dataType":"double"},
            "fail": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["retry"]},{"dataType":"enum","enums":["fatal"]}]},
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
            "deviceId": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IVerifyBiometricSignatureResponseDto": {
        "dataType": "refObject",
        "properties": {
            "verified": {"dataType":"boolean","required":true},
            "tokens": {"ref":"ITokensDto","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IVerifyBiometricSignatureRequestDto": {
        "dataType": "refObject",
        "properties": {
            "userId": {"dataType":"string","required":true},
            "deviceId": {"dataType":"string","required":true},
            "nonce": {"dataType":"string","required":true},
            "signature": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IBiometricDeviceDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "deviceId": {"dataType":"string","required":true},
            "deviceName": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "lastUsedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "createdAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IBiometricDevicesResponseDto": {
        "dataType": "refObject",
        "properties": {
            "devices": {"dataType":"array","array":{"dataType":"refObject","ref":"IBiometricDeviceDto"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.unknown_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"any"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AuditEventDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "type": {"dataType":"string","required":true},
            "actorId": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "subjectId": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "ip": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "userAgent": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "meta": {"ref":"Record_string.unknown_","required":true},
            "createdAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ICursorPageDto_AuditEventDto_": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"AuditEventDto"},"required":true},
            "nextCursor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiKeyDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "prefix": {"dataType":"string","required":true},
            "scopes": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "ownerId": {"dataType":"string","required":true},
            "lastUsedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "expiresAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "revokedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "createdAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ICreatedApiKeyDto": {
        "dataType": "refObject",
        "properties": {
            "apiKey": {"ref":"ApiKeyDto","required":true},
            "key": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ICreateApiKeyBody": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true,"validators":{"minLength":{"value":1},"maxLength":{"value":100}}},
            "scopes": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "expiresAt": {"dataType":"datetime"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IPaginatedDto_ApiKeyDto_": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"ApiKeyDto"},"required":true},
            "total": {"dataType":"double","required":true},
            "offset": {"dataType":"double","required":true},
            "limit": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EAgentStatus": {
        "dataType": "refEnum",
        "enums": ["online","offline"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EAgentTransport": {
        "dataType": "refEnum",
        "enums": ["ws","http"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IAlpHost": {
        "dataType": "refObject",
        "properties": {
            "hostname": {"dataType":"string","required":true},
            "os": {"dataType":"string","required":true},
            "arch": {"dataType":"string","required":true},
            "platform": {"dataType":"string"},
            "kernel": {"dataType":"string"},
            "cpus": {"dataType":"double"},
            "memoryBytes": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TAgentHost": {
        "dataType": "refAlias",
        "type": {"ref":"IAlpHost","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.number-or-null_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"double"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IAlpCapabilities": {
        "dataType": "refObject",
        "properties": {
            "jobs": {"dataType":"nestedObjectLiteral","nestedProperties":{"queues":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"concurrency":{"dataType":"double","required":true},"name":{"dataType":"string","required":true}}},"required":true}}},
            "commands": {"dataType":"nestedObjectLiteral","nestedProperties":{"names":{"dataType":"array","array":{"dataType":"string"},"required":true}}},
            "state": {"dataType":"nestedObjectLiteral","nestedProperties":{"domains":{"ref":"Record_string.number-or-null_","required":true}}},
            "telemetry": {"dataType":"nestedObjectLiteral","nestedProperties":{"channels":{"dataType":"array","array":{"dataType":"string"},"required":true}}},
            "update": {"dataType":"nestedObjectLiteral","nestedProperties":{"mode":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["self"]},{"dataType":"enum","enums":["external"]},{"dataType":"enum","enums":["disabled"]}],"required":true}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.number_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"double"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IAgentLiveStatus": {
        "dataType": "refObject",
        "properties": {
            "state": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["starting"]},{"dataType":"enum","enums":["idle"]},{"dataType":"enum","enums":["busy"]},{"dataType":"enum","enums":["draining"]},{"dataType":"enum","enums":["updating"]},{"dataType":"enum","enums":["degraded"]}],"required":true},
            "message": {"dataType":"string"},
            "slots": {"ref":"Record_string.number_","required":true},
            "capacity": {"ref":"Record_string.number_"},
            "jobs": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"startedAt":{"dataType":"double"},"queue":{"dataType":"string","required":true},"attempt":{"dataType":"double","required":true},"jobId":{"dataType":"string","required":true}}},"required":true},
            "workloads": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"version":{"dataType":"string"},"instances":{"dataType":"double","required":true},"state":{"dataType":"string","required":true},"name":{"dataType":"string","required":true}}},"required":true},
            "outbox": {"dataType":"double","required":true},
            "receivedAt": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IAlpHostMetrics": {
        "dataType": "refObject",
        "properties": {
            "cpuPercent": {"dataType":"double"},
            "load1": {"dataType":"double"},
            "memUsedBytes": {"dataType":"double"},
            "memTotalBytes": {"dataType":"double"},
            "diskUsedBytes": {"dataType":"double"},
            "diskTotalBytes": {"dataType":"double"},
            "netRxBps": {"dataType":"double"},
            "netTxBps": {"dataType":"double"},
            "uptimeSec": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IAlpGpuMetrics": {
        "dataType": "refObject",
        "properties": {
            "index": {"dataType":"double","required":true},
            "name": {"dataType":"string","required":true},
            "utilPercent": {"dataType":"double"},
            "memUsedBytes": {"dataType":"double"},
            "memTotalBytes": {"dataType":"double"},
            "temperatureC": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IAlpMetrics": {
        "dataType": "refObject",
        "properties": {
            "collectedAt": {"dataType":"double","required":true},
            "host": {"ref":"IAlpHostMetrics"},
            "gpus": {"dataType":"array","array":{"dataType":"refObject","ref":"IAlpGpuMetrics"}},
            "channels": {"ref":"Record_string.unknown_"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IAgentLiveDto": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"union","subSchemas":[{"ref":"IAgentLiveStatus"},{"dataType":"enum","enums":[null]}],"required":true},
            "metrics": {"dataType":"union","subSchemas":[{"ref":"IAlpMetrics"},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AgentDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "labels": {"ref":"Record_string.string_","required":true},
            "status": {"ref":"EAgentStatus","required":true},
            "ephemeral": {"dataType":"boolean","required":true},
            "transport": {"dataType":"union","subSchemas":[{"ref":"EAgentTransport"},{"dataType":"enum","enums":[null]}],"required":true},
            "version": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "protocol": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "host": {"dataType":"union","subSchemas":[{"ref":"TAgentHost"},{"dataType":"enum","enums":[null]}],"required":true},
            "capabilities": {"ref":"IAlpCapabilities","required":true},
            "remoteIp": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "connectedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "lastSeenAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "revokedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "live": {"ref":"IAgentLiveDto"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IPaginatedDto_AgentDto_": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"AgentDto"},"required":true},
            "total": {"dataType":"double","required":true},
            "offset": {"dataType":"double","required":true},
            "limit": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EAgentCommandStatus": {
        "dataType": "refEnum",
        "enums": ["pending","running","succeeded","failed","timeout","cancelled"],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IAgentCommandError": {
        "dataType": "refObject",
        "properties": {
            "code": {"dataType":"string","required":true},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AgentCommandDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "agentId": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "args": {"dataType":"any","required":true},
            "status": {"ref":"EAgentCommandStatus","required":true},
            "output": {"dataType":"string","required":true},
            "result": {"dataType":"any","required":true},
            "error": {"dataType":"union","subSchemas":[{"ref":"IAgentCommandError"},{"dataType":"enum","enums":[null]}],"required":true},
            "exitCode": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "timeoutSec": {"dataType":"double","required":true},
            "requestedBy": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "startedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "finishedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IUpdateAgentBody": {
        "dataType": "refObject",
        "properties": {
            "version": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IPaginatedDto_AgentCommandDto_": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"AgentCommandDto"},"required":true},
            "total": {"dataType":"double","required":true},
            "offset": {"dataType":"double","required":true},
            "limit": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ICreateAgentCommandBody": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true,"validators":{"minLength":{"value":1},"maxLength":{"value":100}}},
            "args": {"dataType":"any"},
            "timeoutSec": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IAgentArtifact": {
        "dataType": "refObject",
        "properties": {
            "os": {"dataType":"string","required":true},
            "arch": {"dataType":"string","required":true},
            "file": {"dataType":"string","required":true},
            "sha256": {"dataType":"string","required":true},
            "signature": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IAgentRelease": {
        "dataType": "refObject",
        "properties": {
            "version": {"dataType":"string","required":true},
            "artifacts": {"dataType":"array","array":{"dataType":"refObject","ref":"IAgentArtifact"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IEnrolledAgentDto": {
        "dataType": "refObject",
        "properties": {
            "agentId": {"dataType":"string","required":true},
            "secret": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IEnrollAgentHost": {
        "dataType": "refObject",
        "properties": {
            "hostname": {"dataType":"string"},
            "os": {"dataType":"string"},
            "arch": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IEnrollAgentBody": {
        "dataType": "refObject",
        "properties": {
            "token": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true,"validators":{"minLength":{"value":1},"maxLength":{"value":200}}},
            "labels": {"ref":"Record_string.string_"},
            "host": {"ref":"IEnrollAgentHost"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IAlpEnvelopeDto": {
        "dataType": "refObject",
        "properties": {
            "type": {"dataType":"string","required":true},
            "id": {"dataType":"string"},
            "re": {"dataType":"string"},
            "seq": {"dataType":"double"},
            "ts": {"dataType":"double"},
            "data": {"dataType":"any"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IAgentSyncDto": {
        "dataType": "refObject",
        "properties": {
            "sessionId": {"dataType":"string","required":true},
            "messages": {"dataType":"array","array":{"dataType":"refObject","ref":"IAlpEnvelopeDto"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IAgentSyncBody": {
        "dataType": "refObject",
        "properties": {
            "sessionId": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "messages": {"dataType":"array","array":{"dataType":"refObject","ref":"IAlpEnvelopeDto"},"required":true},
            "waitSeconds": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AgentEnrollmentTokenDto": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "prefix": {"dataType":"string","required":true},
            "labels": {"ref":"Record_string.string_","required":true},
            "maxUses": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "uses": {"dataType":"double","required":true},
            "ephemeral": {"dataType":"boolean","required":true},
            "expiresAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "revokedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "createdBy": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "createdAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ICreatedEnrollmentTokenDto": {
        "dataType": "refObject",
        "properties": {
            "enrollmentToken": {"ref":"AgentEnrollmentTokenDto","required":true},
            "token": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ICreateEnrollmentTokenBody": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true,"validators":{"minLength":{"value":1},"maxLength":{"value":100}}},
            "labels": {"ref":"Record_string.string_"},
            "maxUses": {"dataType":"double"},
            "ephemeral": {"dataType":"boolean"},
            "expiresAt": {"dataType":"datetime"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IPaginatedDto_AgentEnrollmentTokenDto_": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"AgentEnrollmentTokenDto"},"required":true},
            "total": {"dataType":"double","required":true},
            "offset": {"dataType":"double","required":true},
            "limit": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
};
const templateService = new KoaTemplateService(models, {"noImplicitAdditionalProperties":"silently-remove-extras","bodyCoercion":true});

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa


export function RegisterRoutes(router: KoaRouter,opts?:{multer?:ReturnType<typeof multer>}) {

    // ###########################################################################################################
    //  NOTE: If you do not see routes for all of your controllers in this file, then you might not have informed tsoa of where to look
    //      Please look into the "controllerPathGlobs" config option described in the readme: https://github.com/lukeautry/tsoa
    // ###########################################################################################################

    const upload = opts?.multer ||  multer({"limits":{"fileSize":8388608}});

        const argsPermissionController_getPermissionCatalog: Record<string, TsoaRoute.ParameterSchema> = {
        };
        router.get('/api/v1/permissions',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(PermissionController)),
            ...(fetchMiddlewares<Middleware>(PermissionController.prototype.getPermissionCatalog)),

            async function PermissionController_getPermissionCatalog(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsPermissionController_getPermissionCatalog, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<PermissionController>(PermissionController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getPermissionCatalog',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsFileController_getMyFiles: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                mine: {"in":"query","name":"mine","dataType":"boolean"},
                offset: {"in":"query","name":"offset","dataType":"double"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        router.get('/api/v1/file',
            authenticateMiddleware([{"jwt":["permission:file:view:own"]}]),
            ...(fetchMiddlewares<Middleware>(FileController)),
            ...(fetchMiddlewares<Middleware>(FileController.prototype.getMyFiles)),

            async function FileController_getMyFiles(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsFileController_getMyFiles, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<FileController>(FileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getMyFiles',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsFileController_getFileById: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
        };
        router.get('/api/v1/file/:id',
            authenticateMiddleware([{"jwt":["permission:file:view:own"]}]),
            ...(fetchMiddlewares<Middleware>(FileController)),
            ...(fetchMiddlewares<Middleware>(FileController.prototype.getFileById)),

            async function FileController_getFileById(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsFileController_getFileById, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<FileController>(FileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getFileById',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsFileController_uploadFile: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                file: {"in":"formData","name":"file","required":true,"dataType":"file"},
        };
        router.post('/api/v1/file',
            authenticateMiddleware([{"jwt":[]}]),
            upload.fields([
                {
                    name: "file",
                    maxCount: 1
                }
            ]),
            ...(fetchMiddlewares<Middleware>(FileController)),
            ...(fetchMiddlewares<Middleware>(FileController.prototype.uploadFile)),

            async function FileController_uploadFile(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsFileController_uploadFile, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<FileController>(FileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'uploadFile',
              controller,
              context,
              validatedArgs,
              successStatus: 201,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsFileController_createUpload: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"ICreateUploadBody"},
        };
        router.post('/api/v1/file/uploads',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(FileController)),
            ...(fetchMiddlewares<Middleware>(FileController.prototype.createUpload)),

            async function FileController_createUpload(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsFileController_createUpload, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<FileController>(FileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'createUpload',
              controller,
              context,
              validatedArgs,
              successStatus: 201,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsFileController_completeUpload: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                fileId: {"in":"path","name":"fileId","required":true,"ref":"UUID"},
        };
        router.post('/api/v1/file/uploads/:fileId/complete',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(FileController)),
            ...(fetchMiddlewares<Middleware>(FileController.prototype.completeUpload)),

            async function FileController_completeUpload(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsFileController_completeUpload, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<FileController>(FileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'completeUpload',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsFileController_deleteFile: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
        };
        router.delete('/api/v1/file/:id',
            authenticateMiddleware([{"jwt":["permission:file:delete:own"]}]),
            ...(fetchMiddlewares<Middleware>(FileController)),
            ...(fetchMiddlewares<Middleware>(FileController.prototype.deleteFile)),

            async function FileController_deleteFile(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsFileController_deleteFile, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<FileController>(FileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'deleteFile',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProfileController_getMyProfile: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        router.get('/api/v1/profile/my',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(ProfileController)),
            ...(fetchMiddlewares<Middleware>(ProfileController.prototype.getMyProfile)),

            async function ProfileController_getMyProfile(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsProfileController_getMyProfile, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ProfileController>(ProfileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getMyProfile',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProfileController_updateMyProfile: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"IProfileUpdateRequestDto"},
        };
        router.patch('/api/v1/profile/my/update',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(ProfileController)),
            ...(fetchMiddlewares<Middleware>(ProfileController.prototype.updateMyProfile)),

            async function ProfileController_updateMyProfile(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsProfileController_updateMyProfile, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ProfileController>(ProfileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'updateMyProfile',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProfileController_getPrivacySettings: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        router.get('/api/v1/profile/my/privacy',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(ProfileController)),
            ...(fetchMiddlewares<Middleware>(ProfileController.prototype.getPrivacySettings)),

            async function ProfileController_getPrivacySettings(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsProfileController_getPrivacySettings, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ProfileController>(ProfileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getPrivacySettings',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProfileController_updatePrivacySettings: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"showAvatar":{"ref":"EPrivacyLevel"},"showPhone":{"ref":"EPrivacyLevel"},"showLastOnline":{"ref":"EPrivacyLevel"}}},
        };
        router.patch('/api/v1/profile/my/privacy',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(ProfileController)),
            ...(fetchMiddlewares<Middleware>(ProfileController.prototype.updatePrivacySettings)),

            async function ProfileController_updatePrivacySettings(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsProfileController_updatePrivacySettings, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ProfileController>(ProfileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'updatePrivacySettings',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProfileController_deleteMyProfile: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        router.delete('/api/v1/profile/my/delete',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(ProfileController)),
            ...(fetchMiddlewares<Middleware>(ProfileController.prototype.deleteMyProfile)),

            async function ProfileController_deleteMyProfile(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsProfileController_deleteMyProfile, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ProfileController>(ProfileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'deleteMyProfile',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProfileController_getProfiles: Record<string, TsoaRoute.ParameterSchema> = {
                offset: {"in":"query","name":"offset","dataType":"double"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        router.get('/api/v1/profile/all',
            authenticateMiddleware([{"jwt":["permission:profile:view"]}]),
            ...(fetchMiddlewares<Middleware>(ProfileController)),
            ...(fetchMiddlewares<Middleware>(ProfileController.prototype.getProfiles)),

            async function ProfileController_getProfiles(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsProfileController_getProfiles, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ProfileController>(ProfileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getProfiles',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProfileController_getProfileById: Record<string, TsoaRoute.ParameterSchema> = {
                userId: {"in":"path","name":"userId","required":true,"ref":"UUID"},
        };
        router.get('/api/v1/profile/:userId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(ProfileController)),
            ...(fetchMiddlewares<Middleware>(ProfileController.prototype.getProfileById)),

            async function ProfileController_getProfileById(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsProfileController_getProfileById, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ProfileController>(ProfileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getProfileById',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProfileController_updateProfile: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                userId: {"in":"path","name":"userId","required":true,"ref":"UUID"},
                body: {"in":"body","name":"body","required":true,"ref":"IProfileUpdateRequestDto"},
        };
        router.patch('/api/v1/profile/update/:userId',
            authenticateMiddleware([{"jwt":["permission:profile:update"]}]),
            ...(fetchMiddlewares<Middleware>(ProfileController)),
            ...(fetchMiddlewares<Middleware>(ProfileController.prototype.updateProfile)),

            async function ProfileController_updateProfile(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsProfileController_updateProfile, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ProfileController>(ProfileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'updateProfile',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProfileController_deleteProfile: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                userId: {"in":"path","name":"userId","required":true,"ref":"UUID"},
        };
        router.delete('/api/v1/profile/delete/:userId',
            authenticateMiddleware([{"jwt":["permission:profile:delete"]}]),
            ...(fetchMiddlewares<Middleware>(ProfileController)),
            ...(fetchMiddlewares<Middleware>(ProfileController.prototype.deleteProfile)),

            async function ProfileController_deleteProfile(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsProfileController_deleteProfile, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ProfileController>(ProfileController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'deleteProfile',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsRoleController_getRoles: Record<string, TsoaRoute.ParameterSchema> = {
        };
        router.get('/api/v1/roles',
            authenticateMiddleware([{"jwt":["permission:role:view"]}]),
            ...(fetchMiddlewares<Middleware>(RoleController)),
            ...(fetchMiddlewares<Middleware>(RoleController.prototype.getRoles)),

            async function RoleController_getRoles(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsRoleController_getRoles, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<RoleController>(RoleController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getRoles',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsRoleController_createRole: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"ICreateRoleRequestDto"},
        };
        router.post('/api/v1/roles',
            authenticateMiddleware([{"jwt":["permission:role:create"]}]),
            ...(fetchMiddlewares<Middleware>(RoleController)),
            ...(fetchMiddlewares<Middleware>(RoleController.prototype.createRole)),

            async function RoleController_createRole(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsRoleController_createRole, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<RoleController>(RoleController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'createRole',
              controller,
              context,
              validatedArgs,
              successStatus: 201,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsRoleController_deleteRole: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
        };
        router.delete('/api/v1/roles/:id',
            authenticateMiddleware([{"jwt":["permission:role:delete"]}]),
            ...(fetchMiddlewares<Middleware>(RoleController)),
            ...(fetchMiddlewares<Middleware>(RoleController.prototype.deleteRole)),

            async function RoleController_deleteRole(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsRoleController_deleteRole, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<RoleController>(RoleController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'deleteRole',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsRoleController_setRolePermissions: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
                body: {"in":"body","name":"body","required":true,"ref":"IRolePermissionsRequestDto"},
        };
        router.patch('/api/v1/roles/:id/permissions',
            authenticateMiddleware([{"jwt":["permission:role:update"]}]),
            ...(fetchMiddlewares<Middleware>(RoleController)),
            ...(fetchMiddlewares<Middleware>(RoleController.prototype.setRolePermissions)),

            async function RoleController_setRolePermissions(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsRoleController_setRolePermissions, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<RoleController>(RoleController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'setRolePermissions',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsUserController_getMyUser: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        router.get('/api/v1/user/my',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.getMyUser)),

            async function UserController_getMyUser(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsUserController_getMyUser, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getMyUser',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsUserController_updateMyUser: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"IUserUpdateRequestDto"},
        };
        router.patch('/api/v1/user/my/update',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.updateMyUser)),

            async function UserController_updateMyUser(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsUserController_updateMyUser, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'updateMyUser',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsUserController_confirmEmailChange: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"IUserConfirmEmailChangeDto"},
        };
        router.post('/api/v1/user/my/email/confirm',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.confirmEmailChange)),

            async function UserController_confirmEmailChange(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsUserController_confirmEmailChange, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'confirmEmailChange',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsUserController_deleteMyUser: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"IUserDeleteDto"},
        };
        router.post('/api/v1/user/my/delete',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.deleteMyUser)),

            async function UserController_deleteMyUser(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsUserController_deleteMyUser, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'deleteMyUser',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsUserController_setUsername: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"username":{"dataType":"string","required":true}}},
        };
        router.patch('/api/v1/user/my/username',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.setUsername)),

            async function UserController_setUsername(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsUserController_setUsername, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'setUsername',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsUserController_searchUsers: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                q: {"in":"query","name":"q","required":true,"dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"double"},
                offset: {"in":"query","name":"offset","dataType":"double"},
        };
        router.get('/api/v1/user/search',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.searchUsers)),

            async function UserController_searchUsers(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsUserController_searchUsers, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'searchUsers',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsUserController_getUserByUsername: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                username: {"in":"path","name":"username","required":true,"dataType":"string"},
        };
        router.get('/api/v1/user/by-username/:username',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.getUserByUsername)),

            async function UserController_getUserByUsername(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsUserController_getUserByUsername, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getUserByUsername',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsUserController_getUsers: Record<string, TsoaRoute.ParameterSchema> = {
                offset: {"in":"query","name":"offset","dataType":"double"},
                limit: {"in":"query","name":"limit","dataType":"double"},
                query: {"in":"query","name":"query","dataType":"string"},
        };
        router.get('/api/v1/user/all',
            authenticateMiddleware([{"jwt":["permission:user:view"]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.getUsers)),

            async function UserController_getUsers(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsUserController_getUsers, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getUsers',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsUserController_getUserOptions: Record<string, TsoaRoute.ParameterSchema> = {
                query: {"in":"query","name":"query","dataType":"string"},
        };
        router.get('/api/v1/user/options',
            authenticateMiddleware([{"jwt":["permission:user:view"]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.getUserOptions)),

            async function UserController_getUserOptions(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsUserController_getUserOptions, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getUserOptions',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsUserController_getUserById: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
        };
        router.get('/api/v1/user/:id',
            authenticateMiddleware([{"jwt":["permission:user:view"]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.getUserById)),

            async function UserController_getUserById(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsUserController_getUserById, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getUserById',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsUserController_setPrivileges: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
                body: {"in":"body","name":"body","required":true,"ref":"IUserPrivilegesRequestDto"},
        };
        router.patch('/api/v1/user/setPrivileges/:id',
            authenticateMiddleware([{"jwt":["permission:user:privileges"]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.setPrivileges)),

            async function UserController_setPrivileges(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsUserController_setPrivileges, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'setPrivileges',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsUserController_requestVerifyEmail: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        router.post('/api/v1/user/verify-email/request',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.requestVerifyEmail)),

            async function UserController_requestVerifyEmail(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsUserController_requestVerifyEmail, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'requestVerifyEmail',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsUserController_verifyEmail: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"IUserVerifyEmailDto"},
        };
        router.post('/api/v1/user/verify-email',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.verifyEmail)),

            async function UserController_verifyEmail(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsUserController_verifyEmail, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'verifyEmail',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsUserController_updateUser: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
                body: {"in":"body","name":"body","required":true,"ref":"IUserUpdateRequestDto"},
        };
        router.patch('/api/v1/user/update/:id',
            authenticateMiddleware([{"jwt":["permission:user:update"]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.updateUser)),

            async function UserController_updateUser(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsUserController_updateUser, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'updateUser',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsUserController_changePassword: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"IUserChangePasswordDto"},
        };
        router.post('/api/v1/user/changePassword',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.changePassword)),

            async function UserController_changePassword(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsUserController_changePassword, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'changePassword',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsUserController_deleteUser: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
        };
        router.delete('/api/v1/user/delete/:id',
            authenticateMiddleware([{"jwt":["permission:user:delete"]}]),
            ...(fetchMiddlewares<Middleware>(UserController)),
            ...(fetchMiddlewares<Middleware>(UserController.prototype.deleteUser)),

            async function UserController_deleteUser(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsUserController_deleteUser, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<UserController>(UserController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'deleteUser',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSessionController_getSessions: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                offset: {"in":"query","name":"offset","dataType":"double"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        router.get('/api/v1/session',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(SessionController)),
            ...(fetchMiddlewares<Middleware>(SessionController.prototype.getSessions)),

            async function SessionController_getSessions(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsSessionController_getSessions, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<SessionController>(SessionController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getSessions',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSessionController_terminateSession: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
        };
        router.delete('/api/v1/session/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(SessionController)),
            ...(fetchMiddlewares<Middleware>(SessionController.prototype.terminateSession)),

            async function SessionController_terminateSession(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsSessionController_terminateSession, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<SessionController>(SessionController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'terminateSession',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSessionController_terminateOtherSessions: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        router.post('/api/v1/session/terminate-others',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(SessionController)),
            ...(fetchMiddlewares<Middleware>(SessionController.prototype.terminateOtherSessions)),

            async function SessionController_terminateOtherSessions(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsSessionController_terminateOtherSessions, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<SessionController>(SessionController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'terminateOtherSessions',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_signUp: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"TSignUpRequestDto"},
        };
        router.post('/api/v1/auth/sign-up',
            ...(fetchMiddlewares<Middleware>(AuthController)),
            ...(fetchMiddlewares<Middleware>(AuthController.prototype.signUp)),

            async function AuthController_signUp(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_signUp, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AuthController>(AuthController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'signUp',
              controller,
              context,
              validatedArgs,
              successStatus: 201,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_signIn: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"ISignInRequestDto"},
        };
        router.post('/api/v1/auth/sign-in',
            ...(fetchMiddlewares<Middleware>(AuthController)),
            ...(fetchMiddlewares<Middleware>(AuthController.prototype.signIn)),

            async function AuthController_signIn(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_signIn, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AuthController>(AuthController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'signIn',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_requestResetPassword: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"IUserLoginRequestDto"},
        };
        router.post('/api/v1/auth/request-reset-password',
            ...(fetchMiddlewares<Middleware>(AuthController)),
            ...(fetchMiddlewares<Middleware>(AuthController.prototype.requestResetPassword)),

            async function AuthController_requestResetPassword(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_requestResetPassword, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AuthController>(AuthController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'requestResetPassword',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_resetPassword: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"IUserResetPasswordRequestDto"},
        };
        router.post('/api/v1/auth/reset-password',
            ...(fetchMiddlewares<Middleware>(AuthController)),
            ...(fetchMiddlewares<Middleware>(AuthController.prototype.resetPassword)),

            async function AuthController_resetPassword(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_resetPassword, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AuthController>(AuthController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'resetPassword',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_refresh: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"IRefreshRequestDto"},
        };
        router.post('/api/v1/auth/refresh',
            ...(fetchMiddlewares<Middleware>(AuthController)),
            ...(fetchMiddlewares<Middleware>(AuthController.prototype.refresh)),

            async function AuthController_refresh(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_refresh, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AuthController>(AuthController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'refresh',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_signOut: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        router.post('/api/v1/auth/sign-out',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(AuthController)),
            ...(fetchMiddlewares<Middleware>(AuthController.prototype.signOut)),

            async function AuthController_signOut(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_signOut, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AuthController>(AuthController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'signOut',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_signOutAll: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        router.post('/api/v1/auth/sign-out-all',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(AuthController)),
            ...(fetchMiddlewares<Middleware>(AuthController.prototype.signOutAll)),

            async function AuthController_signOutAll(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_signOutAll, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AuthController>(AuthController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'signOutAll',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_enable2FA: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"IEnable2FARequestDto"},
        };
        router.post('/api/v1/auth/enable-2fa',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(AuthController)),
            ...(fetchMiddlewares<Middleware>(AuthController.prototype.enable2FA)),

            async function AuthController_enable2FA(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_enable2FA, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AuthController>(AuthController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'enable2FA',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_disable2FA: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"IDisable2FARequestDto"},
        };
        router.post('/api/v1/auth/disable-2fa',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(AuthController)),
            ...(fetchMiddlewares<Middleware>(AuthController.prototype.disable2FA)),

            async function AuthController_disable2FA(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_disable2FA, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AuthController>(AuthController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'disable2FA',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_verify2FA: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"IVerify2FARequestDto"},
        };
        router.post('/api/v1/auth/verify-2fa',
            ...(fetchMiddlewares<Middleware>(AuthController)),
            ...(fetchMiddlewares<Middleware>(AuthController.prototype.verify2FA)),

            async function AuthController_verify2FA(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_verify2FA, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AuthController>(AuthController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'verify2FA',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPasskeysController_getPasskeys: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                offset: {"in":"query","name":"offset","dataType":"double"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        router.get('/api/v1/passkeys',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(PasskeysController)),
            ...(fetchMiddlewares<Middleware>(PasskeysController.prototype.getPasskeys)),

            async function PasskeysController_getPasskeys(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsPasskeysController_getPasskeys, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<PasskeysController>(PasskeysController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getPasskeys',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPasskeysController_deletePasskey: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        router.delete('/api/v1/passkeys/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(PasskeysController)),
            ...(fetchMiddlewares<Middleware>(PasskeysController.prototype.deletePasskey)),

            async function PasskeysController_deletePasskey(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsPasskeysController_deletePasskey, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<PasskeysController>(PasskeysController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'deletePasskey',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPasskeysController_generateRegistrationOptions: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        router.post('/api/v1/passkeys/generate-registration-options',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(PasskeysController)),
            ...(fetchMiddlewares<Middleware>(PasskeysController.prototype.generateRegistrationOptions)),

            async function PasskeysController_generateRegistrationOptions(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsPasskeysController_generateRegistrationOptions, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<PasskeysController>(PasskeysController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'generateRegistrationOptions',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPasskeysController_verifyRegistration: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"IVerifyRegistrationRequestDto"},
        };
        router.post('/api/v1/passkeys/verify-registration',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(PasskeysController)),
            ...(fetchMiddlewares<Middleware>(PasskeysController.prototype.verifyRegistration)),

            async function PasskeysController_verifyRegistration(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsPasskeysController_verifyRegistration, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<PasskeysController>(PasskeysController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'verifyRegistration',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPasskeysController_generateAuthenticationOptions: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"IGenerateAuthenticationOptionsRequestDto"},
        };
        router.post('/api/v1/passkeys/generate-authentication-options',
            ...(fetchMiddlewares<Middleware>(PasskeysController)),
            ...(fetchMiddlewares<Middleware>(PasskeysController.prototype.generateAuthenticationOptions)),

            async function PasskeysController_generateAuthenticationOptions(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsPasskeysController_generateAuthenticationOptions, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<PasskeysController>(PasskeysController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'generateAuthenticationOptions',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPasskeysController_verifyAuthentication: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"IVerifyAuthenticationRequestDto"},
        };
        router.post('/api/v1/passkeys/verify-authentication',
            ...(fetchMiddlewares<Middleware>(PasskeysController)),
            ...(fetchMiddlewares<Middleware>(PasskeysController.prototype.verifyAuthentication)),

            async function PasskeysController_verifyAuthentication(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsPasskeysController_verifyAuthentication, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<PasskeysController>(PasskeysController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'verifyAuthentication',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsJobsController_listJobs: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                status: {"in":"query","name":"status","ref":"EJobRunStatus"},
                scopeType: {"in":"query","name":"scopeType","dataType":"string"},
                scopeId: {"in":"query","name":"scopeId","dataType":"string"},
                offset: {"in":"query","name":"offset","dataType":"double"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        router.get('/api/v1/jobs',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(JobsController)),
            ...(fetchMiddlewares<Middleware>(JobsController.prototype.listJobs)),

            async function JobsController_listJobs(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsJobsController_listJobs, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<JobsController>(JobsController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'listJobs',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsJobsController_getJob: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
                waitSeconds: {"in":"query","name":"waitSeconds","dataType":"double"},
        };
        router.get('/api/v1/jobs/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(JobsController)),
            ...(fetchMiddlewares<Middleware>(JobsController.prototype.getJob)),

            async function JobsController_getJob(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsJobsController_getJob, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<JobsController>(JobsController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getJob',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsJobsController_cancelJob: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
        };
        router.post('/api/v1/jobs/:id/cancel',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(JobsController)),
            ...(fetchMiddlewares<Middleware>(JobsController.prototype.cancelJob)),

            async function JobsController_cancelJob(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsJobsController_cancelJob, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<JobsController>(JobsController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'cancelJob',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsJobsController_stopJob: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
        };
        router.post('/api/v1/jobs/:id/stop',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(JobsController)),
            ...(fetchMiddlewares<Middleware>(JobsController.prototype.stopJob)),

            async function JobsController_stopJob(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsJobsController_stopJob, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<JobsController>(JobsController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'stopJob',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsJobsController_demoEchoJob: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"IDemoEchoData"},
        };
        router.post('/api/v1/jobs/demo/echo',
            authenticateMiddleware([{"jwt":["permission:jobs:demo"]}]),
            ...(fetchMiddlewares<Middleware>(JobsController)),
            ...(fetchMiddlewares<Middleware>(JobsController.prototype.demoEchoJob)),

            async function JobsController_demoEchoJob(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsJobsController_demoEchoJob, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<JobsController>(JobsController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'demoEchoJob',
              controller,
              context,
              validatedArgs,
              successStatus: 201,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsBiometricController_registerBiometric: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"IRegisterBiometricRequestDto"},
        };
        router.post('/api/v1/biometric/register',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(BiometricController)),
            ...(fetchMiddlewares<Middleware>(BiometricController.prototype.registerBiometric)),

            async function BiometricController_registerBiometric(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsBiometricController_registerBiometric, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<BiometricController>(BiometricController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'registerBiometric',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsBiometricController_generateNonce: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"IGenerateNonceRequestDto"},
        };
        router.post('/api/v1/biometric/generate-nonce',
            ...(fetchMiddlewares<Middleware>(BiometricController)),
            ...(fetchMiddlewares<Middleware>(BiometricController.prototype.generateNonce)),

            async function BiometricController_generateNonce(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsBiometricController_generateNonce, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<BiometricController>(BiometricController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'generateNonce',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsBiometricController_verifySignature: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"IVerifyBiometricSignatureRequestDto"},
        };
        router.post('/api/v1/biometric/verify-signature',
            ...(fetchMiddlewares<Middleware>(BiometricController)),
            ...(fetchMiddlewares<Middleware>(BiometricController.prototype.verifySignature)),

            async function BiometricController_verifySignature(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsBiometricController_verifySignature, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<BiometricController>(BiometricController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'verifySignature',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsBiometricController_getDevices: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        router.get('/api/v1/biometric/devices',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(BiometricController)),
            ...(fetchMiddlewares<Middleware>(BiometricController.prototype.getDevices)),

            async function BiometricController_getDevices(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsBiometricController_getDevices, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<BiometricController>(BiometricController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getDevices',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsBiometricController_deleteDevice: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                deviceId: {"in":"path","name":"deviceId","required":true,"dataType":"string"},
        };
        router.delete('/api/v1/biometric/:deviceId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(BiometricController)),
            ...(fetchMiddlewares<Middleware>(BiometricController.prototype.deleteDevice)),

            async function BiometricController_deleteDevice(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsBiometricController_deleteDevice, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<BiometricController>(BiometricController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'deleteDevice',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuditController_getMyAudit: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                cursor: {"in":"query","name":"cursor","dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"double"},
                type: {"in":"query","name":"type","dataType":"string"},
        };
        router.get('/api/v1/audit/my',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<Middleware>(AuditController)),
            ...(fetchMiddlewares<Middleware>(AuditController.prototype.getMyAudit)),

            async function AuditController_getMyAudit(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAuditController_getMyAudit, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AuditController>(AuditController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getMyAudit',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuditController_listAuditEvents: Record<string, TsoaRoute.ParameterSchema> = {
                cursor: {"in":"query","name":"cursor","dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"double"},
                type: {"in":"query","name":"type","dataType":"string"},
                actorId: {"in":"query","name":"actorId","ref":"UUID"},
        };
        router.get('/api/v1/audit',
            authenticateMiddleware([{"jwt":["permission:audit:view"]}]),
            ...(fetchMiddlewares<Middleware>(AuditController)),
            ...(fetchMiddlewares<Middleware>(AuditController.prototype.listAuditEvents)),

            async function AuditController_listAuditEvents(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAuditController_listAuditEvents, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AuditController>(AuditController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'listAuditEvents',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsApiKeyController_createApiKey: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"ICreateApiKeyBody"},
        };
        router.post('/api/v1/api-keys',
            authenticateMiddleware([{"jwt":["permission:apikey:create"]}]),
            ...(fetchMiddlewares<Middleware>(ApiKeyController)),
            ...(fetchMiddlewares<Middleware>(ApiKeyController.prototype.createApiKey)),

            async function ApiKeyController_createApiKey(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsApiKeyController_createApiKey, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ApiKeyController>(ApiKeyController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'createApiKey',
              controller,
              context,
              validatedArgs,
              successStatus: 201,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsApiKeyController_listApiKeys: Record<string, TsoaRoute.ParameterSchema> = {
                offset: {"in":"query","name":"offset","dataType":"double"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        router.get('/api/v1/api-keys',
            authenticateMiddleware([{"jwt":["permission:apikey:view"]}]),
            ...(fetchMiddlewares<Middleware>(ApiKeyController)),
            ...(fetchMiddlewares<Middleware>(ApiKeyController.prototype.listApiKeys)),

            async function ApiKeyController_listApiKeys(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsApiKeyController_listApiKeys, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ApiKeyController>(ApiKeyController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'listApiKeys',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsApiKeyController_revokeApiKey: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        router.post('/api/v1/api-keys/:id/revoke',
            authenticateMiddleware([{"jwt":["permission:apikey:revoke"]}]),
            ...(fetchMiddlewares<Middleware>(ApiKeyController)),
            ...(fetchMiddlewares<Middleware>(ApiKeyController.prototype.revokeApiKey)),

            async function ApiKeyController_revokeApiKey(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsApiKeyController_revokeApiKey, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<ApiKeyController>(ApiKeyController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'revokeApiKey',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentController_listAgents: Record<string, TsoaRoute.ParameterSchema> = {
                status: {"in":"query","name":"status","ref":"EAgentStatus"},
                offset: {"in":"query","name":"offset","dataType":"double"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        router.get('/api/v1/agents',
            authenticateMiddleware([{"jwt":["permission:agent:view"]}]),
            ...(fetchMiddlewares<Middleware>(AgentController)),
            ...(fetchMiddlewares<Middleware>(AgentController.prototype.listAgents)),

            async function AgentController_listAgents(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAgentController_listAgents, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AgentController>(AgentController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'listAgents',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentController_getAgent: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
        };
        router.get('/api/v1/agents/:id',
            authenticateMiddleware([{"jwt":["permission:agent:view"]}]),
            ...(fetchMiddlewares<Middleware>(AgentController)),
            ...(fetchMiddlewares<Middleware>(AgentController.prototype.getAgent)),

            async function AgentController_getAgent(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAgentController_getAgent, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AgentController>(AgentController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getAgent',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentController_revokeAgent: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        router.post('/api/v1/agents/:id/revoke',
            authenticateMiddleware([{"jwt":["permission:agent:revoke"]}]),
            ...(fetchMiddlewares<Middleware>(AgentController)),
            ...(fetchMiddlewares<Middleware>(AgentController.prototype.revokeAgent)),

            async function AgentController_revokeAgent(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAgentController_revokeAgent, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AgentController>(AgentController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'revokeAgent',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentController_updateAgent: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"IUpdateAgentBody"},
        };
        router.post('/api/v1/agents/:id/update',
            authenticateMiddleware([{"jwt":["permission:agent:command"]}]),
            ...(fetchMiddlewares<Middleware>(AgentController)),
            ...(fetchMiddlewares<Middleware>(AgentController.prototype.updateAgent)),

            async function AgentController_updateAgent(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAgentController_updateAgent, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AgentController>(AgentController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'updateAgent',
              controller,
              context,
              validatedArgs,
              successStatus: 201,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentController_listAgentCommands: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
                offset: {"in":"query","name":"offset","dataType":"double"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        router.get('/api/v1/agents/:id/commands',
            authenticateMiddleware([{"jwt":["permission:agent:view"]}]),
            ...(fetchMiddlewares<Middleware>(AgentController)),
            ...(fetchMiddlewares<Middleware>(AgentController.prototype.listAgentCommands)),

            async function AgentController_listAgentCommands(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAgentController_listAgentCommands, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AgentController>(AgentController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'listAgentCommands',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentController_createAgentCommand: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"ICreateAgentCommandBody"},
        };
        router.post('/api/v1/agents/:id/commands',
            authenticateMiddleware([{"jwt":["permission:agent:command"]}]),
            ...(fetchMiddlewares<Middleware>(AgentController)),
            ...(fetchMiddlewares<Middleware>(AgentController.prototype.createAgentCommand)),

            async function AgentController_createAgentCommand(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAgentController_createAgentCommand, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AgentController>(AgentController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'createAgentCommand',
              controller,
              context,
              validatedArgs,
              successStatus: 201,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentReleaseController_listAgentReleases: Record<string, TsoaRoute.ParameterSchema> = {
        };
        router.get('/api/v1/agent-releases',
            authenticateMiddleware([{"jwt":["permission:agent:view"]}]),
            ...(fetchMiddlewares<Middleware>(AgentReleaseController)),
            ...(fetchMiddlewares<Middleware>(AgentReleaseController.prototype.listAgentReleases)),

            async function AgentReleaseController_listAgentReleases(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAgentReleaseController_listAgentReleases, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AgentReleaseController>(AgentReleaseController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'listAgentReleases',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentLinkController_enrollAgent: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"IEnrollAgentBody"},
        };
        router.post('/api/v1/agent-link/enroll',
            ...(fetchMiddlewares<Middleware>(AgentLinkController)),
            ...(fetchMiddlewares<Middleware>(AgentLinkController.prototype.enrollAgent)),

            async function AgentLinkController_enrollAgent(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAgentLinkController_enrollAgent, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AgentLinkController>(AgentLinkController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'enrollAgent',
              controller,
              context,
              validatedArgs,
              successStatus: 201,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentLinkController_syncAgentLink: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"IAgentSyncBody"},
        };
        router.post('/api/v1/agent-link/sync',
            authenticateMiddleware([{"agent":[]}]),
            ...(fetchMiddlewares<Middleware>(AgentLinkController)),
            ...(fetchMiddlewares<Middleware>(AgentLinkController.prototype.syncAgentLink)),

            async function AgentLinkController_syncAgentLink(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAgentLinkController_syncAgentLink, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AgentLinkController>(AgentLinkController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'syncAgentLink',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentLinkController_downloadAgentRelease: Record<string, TsoaRoute.ParameterSchema> = {
                version: {"in":"path","name":"version","required":true,"dataType":"string"},
                os: {"in":"path","name":"os","required":true,"dataType":"string"},
                arch: {"in":"path","name":"arch","required":true,"dataType":"string"},
        };
        router.get('/api/v1/agent-link/releases/:version/:os/:arch',
            authenticateMiddleware([{"agent":[]}]),
            ...(fetchMiddlewares<Middleware>(AgentLinkController)),
            ...(fetchMiddlewares<Middleware>(AgentLinkController.prototype.downloadAgentRelease)),

            async function AgentLinkController_downloadAgentRelease(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAgentLinkController_downloadAgentRelease, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AgentLinkController>(AgentLinkController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'downloadAgentRelease',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentEnrollmentTokenController_createEnrollmentToken: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"ICreateEnrollmentTokenBody"},
        };
        router.post('/api/v1/agent-enrollment-tokens',
            authenticateMiddleware([{"jwt":["permission:agent:enroll"]}]),
            ...(fetchMiddlewares<Middleware>(AgentEnrollmentTokenController)),
            ...(fetchMiddlewares<Middleware>(AgentEnrollmentTokenController.prototype.createEnrollmentToken)),

            async function AgentEnrollmentTokenController_createEnrollmentToken(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAgentEnrollmentTokenController_createEnrollmentToken, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AgentEnrollmentTokenController>(AgentEnrollmentTokenController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'createEnrollmentToken',
              controller,
              context,
              validatedArgs,
              successStatus: 201,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentEnrollmentTokenController_listEnrollmentTokens: Record<string, TsoaRoute.ParameterSchema> = {
                offset: {"in":"query","name":"offset","dataType":"double"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        router.get('/api/v1/agent-enrollment-tokens',
            authenticateMiddleware([{"jwt":["permission:agent:enroll"]}]),
            ...(fetchMiddlewares<Middleware>(AgentEnrollmentTokenController)),
            ...(fetchMiddlewares<Middleware>(AgentEnrollmentTokenController.prototype.listEnrollmentTokens)),

            async function AgentEnrollmentTokenController_listEnrollmentTokens(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAgentEnrollmentTokenController_listEnrollmentTokens, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AgentEnrollmentTokenController>(AgentEnrollmentTokenController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'listEnrollmentTokens',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentEnrollmentTokenController_revokeEnrollmentToken: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
        };
        router.post('/api/v1/agent-enrollment-tokens/:id/revoke',
            authenticateMiddleware([{"jwt":["permission:agent:enroll"]}]),
            ...(fetchMiddlewares<Middleware>(AgentEnrollmentTokenController)),
            ...(fetchMiddlewares<Middleware>(AgentEnrollmentTokenController.prototype.revokeEnrollmentToken)),

            async function AgentEnrollmentTokenController_revokeEnrollmentToken(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAgentEnrollmentTokenController_revokeEnrollmentToken, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AgentEnrollmentTokenController>(AgentEnrollmentTokenController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'revokeEnrollmentToken',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentCommandController_getAgentCommand: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
        };
        router.get('/api/v1/agent-commands/:id',
            authenticateMiddleware([{"jwt":["permission:agent:view"]}]),
            ...(fetchMiddlewares<Middleware>(AgentCommandController)),
            ...(fetchMiddlewares<Middleware>(AgentCommandController.prototype.getAgentCommand)),

            async function AgentCommandController_getAgentCommand(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAgentCommandController_getAgentCommand, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AgentCommandController>(AgentCommandController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'getAgentCommand',
              controller,
              context,
              validatedArgs,
              successStatus: undefined,
            });
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAgentCommandController_cancelAgentCommand: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"ref":"UUID"},
        };
        router.post('/api/v1/agent-commands/:id/cancel',
            authenticateMiddleware([{"jwt":["permission:agent:command"]}]),
            ...(fetchMiddlewares<Middleware>(AgentCommandController)),
            ...(fetchMiddlewares<Middleware>(AgentCommandController.prototype.cancelAgentCommand)),

            async function AgentCommandController_cancelAgentCommand(context: Context, next: Next) {

            let validatedArgs: any[] = [];
            try {
              validatedArgs = templateService.getValidatedArgs({ args: argsAgentCommandController_cancelAgentCommand, context, next });
            } catch (err) {
              const error = err as any;
              error.message ||= JSON.stringify({ fields: error.fields });
              context.status = error.status;
              context.throw(context.status, error.message, error);
            }

            const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(context.request) : iocContainer;

            const controller: any = await container.get<AgentCommandController>(AgentCommandController);
            if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
            }

            return templateService.apiHandler({
              methodName: 'cancelAgentCommand',
              controller,
              context,
              validatedArgs,
              successStatus: 204,
            });
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
                            koaAuthenticationRecasted(context.request, name, secMethod[name], context.response)
                                .catch(pushAndRethrow)
                        );
                    }

                    secMethodOrPromises.push(Promise.all(secMethodAndPromises)
                        .then(users => { return users[0]; }));
                } else {
                    for (const name in secMethod) {
                        secMethodOrPromises.push(
                            koaAuthenticationRecasted(context.request, name, secMethod[name], context.response)
                                .catch(pushAndRethrow)
                        );
                    }
                }
            }

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let success;
            try {
                const user = await Promise.any(secMethodOrPromises);
                success = true;
                context.request['user'] = user;
            }
            catch(err) {
                // Response was sent in middleware, abort
                if(context.response.body) {
                    return;
                }

                // Show most recent error as response
                const error = failedAttempts.pop();
                context.status = error.status || 401;
                context.throw(context.status, error.message, error);
            }

            // Response was sent in middleware, abort
            if(context.response.body) {
                return;
            }

            if (success) {
                await next();
            }

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        }
    }

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
}

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
