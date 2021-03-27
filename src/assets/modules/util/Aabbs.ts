import * as THREE from 'three';
import { Vector3, Box3 } from 'three';

const signedUnitVectors: Vector3[] = [
    new Vector3(-1, 0, 0),
    new Vector3(0, -1, 0),
    new Vector3(0, 0, -1),
    new Vector3(1, 0, 0),
    new Vector3(0, 1, 0),
    new Vector3(0, 0, 1),
];

/**
 * Returns an array of signed (it returns the result of subtraction point
 * coordinates from the aabb's min/max coordinates) distances to the given
 * AABB's sides in the following order: min.xyz, max.xyz.
 */
export function signedDistancesToAabbSides(point: Vector3, aabb: Box3): number[] {
    const result: number[] = [];

    for (let i = 0; i < 3; i++) {
        result.push(point.getComponent(i) - aabb.min.getComponent(i));
    }
    for (let i = 0; i < 3; i++) {
        result.push(point.getComponent(i) - aabb.max.getComponent(i));
    }
    return result;
}

export function distancesToAabbSides(point: Vector3, aabb: Box3): number[] {
    const result: number[] = signedDistancesToAabbSides(point, aabb);
    for (let i = 0; i < result.length; i++) {
        result[i] = Math.abs(result[i]);
    }
    return result;
}

/**
 * Returns a vector pointing to the closest point on the surface of the given
 * AABB.
 */
export function vectorToAabbBoundary(point: Vector3, aabb: Box3): Vector3 {
    if (!aabb.containsPoint(point)) {
        const closestPoint: Vector3 = point.clone();
        aabb.clampPoint(point, closestPoint);
        return closestPoint.sub(point);
    }

    const distances: number[] = distancesToAabbSides(point, aabb);
    let minDistance: number = distances[0];
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
 * In case `point` is not inside / on the boundary of the AABB, returns a
 * 0-vector.
 */
export function vectorFromAabbBoundary(
    point: Vector3,
    aabb: Box3,
    epsilonDistance: number,
): Vector3 {
    if (!aabb.containsPoint(point)) {
        return new Vector3();
    }

    const resultVector = new Vector3();
    const signedDistances: number[] = signedDistancesToAabbSides(point, aabb);
    for (let i = 0; i < signedDistances.length; i++) {
        if (Math.abs(signedDistances[i]) > epsilonDistance) {
            continue;
        }
        resultVector.add(
            signedUnitVectors[i].clone().multiplyScalar(signedDistances[i] - epsilonDistance),
        );
    }

    return resultVector;
}

/**
 * If the given point is outside the AABB, the function maps it back inside
 * the AABB. If the point goes off the AABB from one side, it appears on the
 * other side.
 */
export function mirrorInsideAabb(point: Vector3, aabb: Box3): Vector3 {
    if (aabb.containsPoint(point)) {
        return point.clone();
    }

    const mirroredVector = new Vector3();
    const signedDistances: number[] = signedDistancesToAabbSides(point, aabb);
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
 */
export function aabbCenteredAt(center: Vector3, size: Vector3): Box3 {
    const halfSize: Vector3 = size.clone().divideScalar(2);
    const min: Vector3 = center.clone().sub(halfSize);
    const max: Vector3 = center.clone().add(halfSize);
    return new Box3(min, max);
}

export function aabbInsideSphere(aabb: Box3, sphere: THREE.Sphere): boolean {
    if (!aabb.containsPoint(sphere.center)) {
        return false;
    }

    const distances: number[] = distancesToAabbSides(sphere.center, aabb);
    for (let i = 0; i < distances.length; i++) {
        if (distances[i] > sphere.radius) {
            return false;
        }
    }

    return true;
}
