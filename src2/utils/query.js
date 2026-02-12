const config = require('../config/config');

/**
 * Paginate query results
 * @param {Object} query - Mongoose query object
 * @param {Number} page - Page number
 * @param {Number} limit - Items per page
 * @returns {Object} Paginated results with metadata
 */
const paginate = async (query, page = 1, limit = config.DEFAULT_PAGE_SIZE) => {
    // Ensure page and limit are positive integers
    page = Math.max(1, parseInt(page));
    limit = Math.min(config.MAX_PAGE_SIZE, Math.max(1, parseInt(limit)));

    const startIndex = (page - 1) * limit;

    // Execute query
    const results = await query.skip(startIndex).limit(limit);
    
    // Get total count
    const total = await query.model.countDocuments(query.getQuery());
    
    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
        data: results,
        pagination: {
            current: page,
            pages: totalPages,
            count: results.length,
            total,
            hasNext,
            hasPrev,
            next: hasNext ? page + 1 : null,
            prev: hasPrev ? page - 1 : null
        }
    };
};

/**
 * Build sort object from query string
 * @param {String} sortBy - Sort string (e.g., "-createdAt,name")
 * @returns {Object} Sort object for Mongoose
 */
const buildSort = (sortBy) => {
    const sort = {};
    
    if (sortBy) {
        const sortFields = sortBy.split(',');
        sortFields.forEach(field => {
            if (field.startsWith('-')) {
                sort[field.substring(1)] = -1; // Descending
            } else {
                sort[field] = 1; // Ascending
            }
        });
    } else {
        sort.createdAt = -1; // Default: newest first
    }
    
    return sort;
};

/**
 * Build filter object from query parameters
 * @param {Object} queryParams - Query parameters
 * @param {Array} allowedFilters - Array of allowed filter fields
 * @returns {Object} Filter object for Mongoose
 */
const buildFilter = (queryParams, allowedFilters = []) => {
    const filter = {};
    
    allowedFilters.forEach(field => {
        if (queryParams[field]) {
            if (Array.isArray(queryParams[field])) {
                filter[field] = { $in: queryParams[field] };
            } else {
                filter[field] = queryParams[field];
            }
        }
    });
    
    // Handle search queries
    if (queryParams.search) {
        const searchFields = queryParams.searchFields 
            ? queryParams.searchFields.split(',') 
            : ['name', 'firstName', 'lastName', 'email'];
            
        filter.$or = searchFields.map(field => ({
            [field]: { $regex: queryParams.search, $options: 'i' }
        }));
    }
    
    return filter;
};

/**
 * Build complete query and options from request query parameters
 * @param {Object} queryParams - Query parameters from request
 * @param {Array} allowedFilters - Array of allowed filter fields
 * @returns {Object} Object with query and options for MongoDB
 */
const buildQuery = (queryParams, allowedFilters = []) => {
    // Build filter using existing buildFilter function
    const query = buildFilter(queryParams, allowedFilters);
    
    // Extract pagination parameters
    const page = Math.max(1, parseInt(queryParams.page) || 1);
    const limit = Math.min(
        config.MAX_PAGE_SIZE, 
        Math.max(1, parseInt(queryParams.limit) || config.DEFAULT_PAGE_SIZE)
    );
    
    // Build sort using existing buildSort function
    const sort = buildSort(queryParams.sort);
    
    // Build options object for MongoDB query
    const options = {
        skip: (page - 1) * limit,
        limit: limit,
        sort: sort
    };
    
    return { query, options };
};

module.exports = {
    paginate,
    buildSort,
    buildFilter,
    buildQuery
};