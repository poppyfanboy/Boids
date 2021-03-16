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
 * Returns an array of signed (it returns the result of subtraction point
 * coordinates from the aabb's min/max coordinates) distances to the given
 * AABB's sides in the following order: min.xyz, max.xyz.
 * @param {THREE.Vector3} point
 * @param {THREE.Box3} aabb
 * @returns {Array.<Number>}
 */
export function signedDistancesToAabbSides(point, aabb) {
    const result = [];

    for (let i = 0; i < 3; i++) {
        result.push(point.getComponent(i) - aabb.min.getComponent(i));
    }
    for (let i = 0; i < 3; i++) {
        result.push(point.getComponent(i) - aabb.max.getComponent(i));
    }
    return result;
}

/**
 * @param {THREE.Vector3} point
 * @param {THREE.Box3} aabb
 * @returns {Array.<Number>}
 */
export function distancesToAabbSides(point, aabb) {
    const result = signedDistancesToAabbSides(point, aabb);
    for (let i = 0; i < result.length; i++) {
        result[i] = Math.abs(result[i]);
    }
    return result;
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

    const distances = distancesToAabbSides(point, aabb);
    let minDistance = distances[0];
    let iMin = 0;
    for (let i = 1; i < distances.length; i++) {
        if (minDistance > distances[i]) {
            iMin = i;
            minDistance = distances[i];
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

    const resultVector = new THREE.Vector3();
    const signedDistances = signedDistancesToAabbSides(point, aabb);
    for (let i = 0; i < signedDistances.length; i++) {
        if (Math.abs(signedDistances[i]) > epsilonDistance) {
            continue;
        }
        resultVector.add(
            signedUnitVectors[i].clone().multiplyScalar(signedDistances[i] - epsilonDistance)
        );
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

    const mirroredVector = new THREE.Vector3();
    const signedDistances = signedDistancesToAabbSides(point, aabb);
    for (let i = 0; i < signedDistances.length; i++) {
        if (i < 3 && signedDistances[i] < 0) {
            mirroredVector.setComponent(i, -2 * signedDistances[i]);
        }
        if (i >= 3 && signedDistances[i] > 0) {
            mirroredVector.setComponent(i % 3, -2 * signedDistances[i]);
        }
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

    const distances = distancesToAabbSides(sphere.center, aabb);
    for (let i = 0; i < distances.length; i++) {
        if (distances[i] > sphere.radius) {
            return false;
        }
    }

    return true;
}
