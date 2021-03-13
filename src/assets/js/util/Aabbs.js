import * as THREE from 'three';

const signedUnitVectors = [
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
];

/**
 * Generates signed (it returns the result of subtraction point coordinates from
 * the aabb's min/max coordinates) distances to the given AABB's sides in the
 * following order: min.xyz, max.xyz.
 * @param {THREE.Vector3} point
 * @param {THREE.Box3} aabb
 * @generator
 * @yields {Number}
 */
export function *signedDistancesToAabbSides(point, aabb) {
    for (let i = 0; i < 3; i++) {
        yield point.getComponent(i) - aabb.min.getComponent(i);
    }

    for (let i = 0; i < 3; i++) {
        yield point.getComponent(i) - aabb.max.getComponent(i);
    }
}

/**
 * @param {THREE.Vector3} point
 * @param {THREE.Box3} aabb
 * @generator
 * @yields {Number}
 */
export function *distancesToAabbSides(point, aabb) {
    for (const signedDistance of signedDistancesToAabbSides(point, aabb)) {
        yield Math.abs(signedDistance);
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
        const distance = distancesIterator.next();
        if (distance.done) {
            break;
        }
        if (minDistance > distance.value) {
            iMin = i;
            minDistance = distance.value;
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

    let i = 0;
    const resultVector = new THREE.Vector3();
    for (const signedDistance of signedDistancesToAabbSides(point, aabb)) {
        if (Math.abs(signedDistance) > epsilonDistance) {
            continue;
        }
        resultVector.add(
            signedUnitVectors[i].clone().multiplyScalar(signedDistance - epsilonDistance)
        );
        i++;
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
export function mirrorInsideAabb(point, aabb) {
    if (aabb.containsPoint(point)) {
        return point.clone();
    }

    let i = 0;
    const mirroredVector = new THREE.Vector3();
    for (const signedDistance of signedDistancesToAabbSides(point, aabb)) {
        if (i < 3 && signedDistance < 0) {
            mirroredVector.setComponent(i, -2 * signedDistance);
        }
        if (i >= 3 && signedDistance > 0) {
            mirroredVector.setComponent(i % 3, -2 * signedDistance);
        }
        i++;
    }

    return mirroredVector.add(point);
}

/**
 * Creates a new AABB with the given parameters.
 * @param {THREE.Vector3} center
 * @param {THREE.Vector3} size
 */
export function aabbCenteredAt(center, size) {
    const halfSize = size.clone().divideScalar(2);
    const min = center.clone().sub(halfSize);
    const max = center.clone().add(halfSize);
    return new THREE.Box3(min, max);
}

/**
 * @param {THREE.Box3} aabb
 * @param {THREE.Sphere} sphere
 */
export function aabbInsideSphere(aabb, sphere) {
    if (!aabb.containsPoint(sphere.center)) {
        return false;
    }
    for (const distance of distancesToAabbSides(sphere.center, aabb)) {
        if (distance > sphere.radius) {
            return false;
        }
    }
    return true;
}
