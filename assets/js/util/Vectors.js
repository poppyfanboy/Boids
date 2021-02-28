/**
 * Assumes that the passed object is a vector with [x, [y, [z, [w]]]] properties
 * defined and tries to guess its size.
 */
function getComponentsCount(vector) {
    let componentsCount = 0;

    if ('x' in vector) {
        componentsCount++;
    } else {
        return componentsCount;
    }

    if ('y' in vector) {
        componentsCount++;
    } else {
        return componentsCount;
    }

    if ('z' in vector) {
        componentsCount++;
    } else {
        return componentsCount;
    }

    if ('w' in vector) {
        componentsCount++;
    }
    return componentsCount;
}

/**
 * @param {THREE.Vector} vector
 * @param {Number} componentsCount
 */
export function maxComponent(vector, componentsCount) {
    if (componentsCount === undefined) {
        componentsCount = getComponentsCount(vector);
    }
    if (componentsCount <= 0) {
        return null;
    }

    let max = vector.getComponent(0);
    for (let i = 1; i < componentsCount; i++) {
        if (vector.getComponent(i) > max) {
            max = vector.getComponent(i);
        }
    }
    return max;
}

/**
 * @param {THREE.Vector} vector
 * @param {Number} componentsCount
 */
export function minComponent(vector, componentsCount) {
    if (componentsCount === undefined) {
        componentsCount = getComponentsCount(vector);
    }
    if (componentsCount <= 0) {
        return null;
    }

    let min = vector.getComponent(0);
    for (let i = 1; i < componentsCount; i++) {
        if (vector.getComponent(i) < min) {
            min = vector.getComponent(i);
        }
    }
    return min;
}
