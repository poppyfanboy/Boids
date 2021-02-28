import * as THREE from '../vendor/three/three.module.js';

const signedUnitVectors = [
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
];

/**
 * Generates distances to the given AABB's sides in the following order:
 * min.xyz, max.xyz.
 * @param {THREE.Vector3} point
 * @param {THREE.Box3} aabb
 * @generator
 * @yields {Number}
 */
export function *distancesToAabbSides(point, aabb) {
    for (let i = 0; i < 3; i++) {
        yield point.getComponent(i) - aabb.min.getComponent(i);
    }

    for (let i = 0; i < 3; i++) {
        yield point.getComponent(i) - aabb.max.getComponent(i);
    }
}

/**
 * Returns a vector pointing to the closest point on the surface of the given AABB.
 * @param {THREE.Vector3} point
 * @param {THREE.Box3} aabb
 * @returns {THREE.Vector3}
 */
export function vectorToAabbBoundary(point, aabb) {
    if (!aabb.containsPoint(point)) {
        const closestPoint = point.clone();
        aabb.clampPoint(point, closestPoint);
        return closestPoint.sub(point);
    }

    const distancesIterator = distancesToAabbSides(point, aabb);
    let minDistance = distancesIterator.next().value;
    let iMin = 0;

    for (let i = 0; i < signedUnitVectors.length; i++) {
        const next = distancesIterator.next();
        if (next.done) {
            break;
        }
        if (minDistance > Math.abs(next.value)) {
            iMin = i;
        }
    }

    return signedUnitVectors[iMin].clone().multiplyScalar(minDistance);
}

/**
 * Returns a vector pointing inside the AABB (adding the returned vector
 * to the `point` argument will result in point being away from each
 * side of the AABB at least by `epsilonDistance` distance).
 * In case `point` is not inside / on the boundary of the AABB, returns a 0-vector.
 * @param {THREE.Vector3} point
 * @param {THREE.Box3} aabb
 * @returns {THREE.Vector3}
 */
export function vectorFromAabbBoundary(point, aabb, epsilonDistance) {
    if (!aabb.containsPoint(point)) {
        return new THREE.Vector3();
    }

    const distancesIterator = distancesToAabbSides(point, aabb);
    const resultVector = new THREE.Vector3();

    for (let i = 0; i < signedUnitVectors.length; i++) {
        const next = distancesIterator.next();
        if (next.done) {
            break;
        }
        if (Math.abs(next.value) > epsilonDistance) {
            continue;
        }
        resultVector.add(signedUnitVectors[i].clone().multiplyScalar(next.value - epsilonDistance));
    }

    return resultVector;
}

/**
 * If the given point is outside the AABB, the function maps it back inside
 * the AABB. If the point goes off the AABB from one side, it appears on the
 * other side.
 * @param {THREE.Vector3} point
 * @param {THREE.Box3} aabb
 * @returns {THREE.Vector3}
 */
export function mirrorInsideAABB(point, aabb) {
    if (aabb.containsPoint(point)) {
        return point.clone();
    }

    const distancesIterator = distancesToAabbSides(point, aabb);
    const mirroredVector = new THREE.Vector3();

    for (let i = 0; i < signedUnitVectors.length; i++) {
        const next = distancesIterator.next();
        if (next.done) {
            break;
        }

        if (i < 3 && next.value < 0) {
            mirroredVector.setComponent(i, -2 * next.value);
        }
        if (i >= 3 && next.value > 0) {
            mirroredVector.setComponent(i % 3, -2 * next.value);
        }
    }

    return mirroredVector.add(point);
}
