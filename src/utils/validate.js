const validate = require('validator');

const validateOwner = function (owner){
    if (owner.firstName?.length < 3 || owner.firstName?.length > 12 ){
        throw new Error("FirstName must be between 3 to 12 characters")
    }
    if (owner.lastName?.length < 3 || owner.lastName?.length > 12 ){
        throw new Error("Lastname must be between 3 to 12 characters")
    }
    if (owner.address?.length > 100 ){
        throw new Error("Address must be less than 40 characters")
    }
    if (owner.bio?.length > 150 ){
        throw new Error("Lastname must be less than 50 characters")
    }
    if (!validate.isEmail(owner.email)){
        throw new Error("Email is invalid");
    }
    if (!validate.isStrongPassword(owner.password)){
        throw new Error("Password is weak");
    }
}

const validateOwnerLoginDetails = function (owner){
    if (!validate.isEmail(owner.email)){
        throw new Error("Email is invalid");
    }
}


const validateTenant = function (tenant){
    if (tenant.firstName?.length < 3 || tenant.firstName?.length > 12 ){
        throw new Error("FirstName must be between 3 to 12 characters")
    }
    if (tenant.lastName?.length < 3 || tenant.lastName?.length > 12 ){
        throw new Error("Lastname must be between 3 to 12 characters")
    }
    if (tenant.occupation?.length < 3 || tenant.occupation?.length > 12 ){
        throw new Error("Address must be between 3 to 12 characters")
    }
    if (tenant.bio?.length > 150 ){
        throw new Error("Lastname must be less than 50 characters")
    }
    if (!validate.isEmail(tenant.email)){
        throw new Error("Email is invalid");
    }
    if (!validate.isStrongPassword(tenant.password)){
        throw new Error("Password is weak");
    }
}


const validateTenantLoginDetails = function (tenant){
    if (!validate.isEmail(tenant.email)){
        throw new Error("Email is invalid");
    }
}

module.exports = {validateOwner, validateOwnerLoginDetails, validateTenant, validateTenantLoginDetails}