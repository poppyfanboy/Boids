import { Vector } from 'three';

/**
 * Assumes that the passed object is a vector with [x, [y, [z, [w]]]] properties
 * defined and tries to guess its size.
 */
function getComponentsCount(vector: Vector) {
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

export function maxComponent(vector: Vector, componentsCount?: number): number {
    if (componentsCount == null) {
        componentsCount = getComponentsCount(vector);
    }
    if (componentsCount <= 0) {
        return Number.NaN;
    }

    let max: number = vector.getComponent(0);
    for (let i = 1; i < componentsCount; i++) {
        if (vector.getComponent(i) > max) {
            max = vector.getComponent(i);
        }
    }
    return max;
}

export function minComponent(vector: Vector, componentsCount?: number): number {
    if (componentsCount == null) {
        componentsCount = getComponentsCount(vector);
    }
    if (componentsCount <= 0) {
        return Number.NaN;
    }

    let min: number = vector.getComponent(0);
    for (let i = 1; i < componentsCount; i++) {
        if (vector.getComponent(i) < min) {
            min = vector.getComponent(i);
        }
    }
    return min;
}
