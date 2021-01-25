import * as THREE from 'three';
import { maxComponent, minComponent } from './Vectors.js';

const unitVectors = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
];

const signedUnitVectors = [
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
];

/**
 * @param {THREE.Ray} ray
 * @param {THREE.Box3} aabb
 * @returns {Array.<THREE.Vector3>}
 */
export function rayVsAabb(ray, aabb, rayMaxLength) {
    const normalizedDirection = ray.direction.clone().normalize();

    const near = aabb.min.clone().sub(ray.origin).divide(normalizedDirection);
    const far = aabb.max.clone().sub(ray.origin).divide(normalizedDirection);
    const tNear = maxComponent(near.clone().min(far));
    const tFar = minComponent(near.clone().max(far));

    if (tNear > tFar || tFar < 0 || tNear > 0 && rayMaxLength < tNear || rayMaxLength < tFar) {
        return null;
    }

    const aabbSize = new THREE.Vector3();
    aabb.getSize(aabbSize);

    const aabbCenter = new THREE.Vector3();
    aabb.getCenter(aabbCenter);

    const fromCenterToIntersection = ray.origin
        .clone()
        .add(normalizedDirection.clone().multiplyScalar(tNear > 0 ? tNear : tFar))
        .sub(aabbCenter);
    const containsOrigin = aabb.containsPoint(ray.origin) ? 1 : -1;

    let normal = new THREE.Vector3();
    let minDistance = Infinity;
    for (let i = 0; i < 3; i++) {
        const distance = Math.abs(
            aabbSize.getComponent(i) - Math.abs(fromCenterToIntersection.getComponent(i))
        );
        if (distance < minDistance) {
            minDistance = distance;
            normal = unitVectors[i]
                .clone()
                .multiplyScalar(
                    Math.sign(fromCenterToIntersection.getComponent(i)) * containsOrigin
                );
        }
    }
    return {
        point: ray.origin
            .clone()
            .add(normalizedDirection.clone().multiplyScalar(tNear > 0 ? tNear : tFar)),
        normal: normal,
    };
}

/**
 *
 * @param {THREE.Ray} line
 * @param {THREE.Box3} aabb
 */
export function lineVsAabb(line, aabb) {
    const normalizedDirection = line.direction.clone().normalize();

    const near = aabb.min.clone().sub(line.origin).divide(normalizedDirection);
    const far = aabb.max.clone().sub(line.origin).divide(normalizedDirection);
    let tNear = maxComponent(near.clone().min(far));
    let tFar = minComponent(near.clone().max(far));

    if (tNear > tFar) {
        return null;
    }

    if (Math.abs(tNear) > Math.abs(tFar)) {
        const swap = tNear;
        tNear = tFar;
        tFar = swap;
    }

    return {
        near: line.origin.clone().add(normalizedDirection.clone().multiplyScalar(tNear)),
        tNear: tNear,
        far: line.origin.clone().add(normalizedDirection.clone().multiplyScalar(tFar)),
        tFar: tFar,
    };
}

/**
 * Returns a vector pointing to the closest point on the surface of the given AABB.
 * @param {THREE.Vector3} point
 * @param {THREE.Box3} aabb
 */
function vectorToAabbBoundary(point, aabb) {
    if (!aabb.containsPoint(point)) {
        const closestPoint = point.clone();
        aabb.clampPoint(closestPoint, closestPoint);
        return closestPoint.sub(point);
    }
    const distances = [
        Math.abs(aabb.min.x - point.x),
        Math.abs(aabb.min.y - point.y),
        Math.abs(aabb.min.z - point.z),

        Math.abs(aabb.max.x - point.x),
        Math.abs(aabb.max.y - point.y),
        Math.abs(aabb.max.z - point.z),
    ];
    let iMin = 0;
    for (let i = 1; i < distances.length; i++) {
        if (distances[iMin] > distances[i]) {
            iMin = i;
        }
    }
    return signedUnitVectors[iMin].clone().multiplyScalar(distances[iMin]);
}

/**
 *
 * @param {THREE.Vector3} point
 * @param {THREE.Box3} aabb
 */
export function distanceToAabbBoundary(point, aabb) {
    return vectorToAabbBoundary(point, aabb).length();
}

/**
 * Returns a vector pointing inside the AABB (adding the returned vector
 * to the `point` argument will result in point being away from each
 * side of the AABB at least by `epsilonDistance` distance).
 * In case `point` is not inside / on the boundary of the AABB, returns a 0-vector.
 * @param {THREE.Vector3} point
 * @param {THREE.Box3} aabb
 */
export function vectorFromAabbBoundary(point, aabb, epsilonDistance) {
    if (!aabb.containsPoint(point) && vectorToAabbBoundary(point, aabb).length() !== 0) {
        return new THREE.Vector3();
    }
    const distances = [
        aabb.min.x - point.x,
        aabb.min.y - point.y,
        aabb.min.z - point.z,
        aabb.max.x - point.x,
        aabb.max.y - point.y,
        aabb.max.z - point.z,
    ];
    const resultVector = new THREE.Vector3();
    for (let i = 0; i < distances.length; i++) {
        const distance = distances[i];
        if (Math.abs(distance) > epsilonDistance) {
            continue;
        }
        resultVector.add(signedUnitVectors[i].clone().multiplyScalar(distance - epsilonDistance));
    }
    return resultVector;
}
