import * as THREE from 'three';
import { Vector3 } from 'three';
import { maxComponent, minComponent } from './Vectors';

const signedUnitVectors: Vector3[] = [
    new Vector3(-1, 0, 0),
    new Vector3(0, -1, 0),
    new Vector3(0, 0, -1),
    new Vector3(1, 0, 0),
    new Vector3(0, 1, 0),
    new Vector3(0, 0, 1),
];

export type RayIntersectionPoint = {
    point: Vector3;
    normal: Vector3;
    distance: number;
};

/**
 * The ray has a direction and a maximum length, thus, the ray won't collide
 * with AABBs which are behind the ray's origin or too far away from the origin.
 */
export function rayVsAabb(
    ray: THREE.Ray,
    aabb: THREE.Box3,
    rayMaxLength = Infinity,
    epsilon = 1e-3,
): RayIntersectionPoint[] {
    const normalizedDirection: Vector3 = ray.direction.clone().normalize();

    const near: Vector3 = aabb.min.clone().sub(ray.origin).divide(normalizedDirection);
    const far: Vector3 = aabb.max.clone().sub(ray.origin).divide(normalizedDirection);
    const tNear: number = maxComponent(near.clone().min(far), 3);
    const tFar: number = minComponent(near.clone().max(far), 3);

    if (tNear > tFar || tFar < 0 || tNear > 0 && rayMaxLength < tNear || rayMaxLength < tFar) {
        return [];
    }

    const closestIntersection: Vector3 = ray.origin
        .clone()
        .add(normalizedDirection.clone().multiplyScalar(tNear > 0 ? tNear : tFar));

    const aabbCenter = new Vector3();
    aabb.getCenter(aabbCenter);

    // coordinates relative to the AABB center
    const fromCenterToIntersection: Vector3 = closestIntersection.clone().sub(aabbCenter);
    const aabbMin: Vector3 = aabb.min.clone().sub(aabbCenter);
    const aabbMax: Vector3 = aabb.max.clone().sub(aabbCenter);

    const normal = new Vector3();
    for (let i = 0; i < signedUnitVectors.length; i++) {
        if (
            i < 3 &&
            Math.abs(fromCenterToIntersection.getComponent(i % 3) - aabbMin.getComponent(i % 3)) <
                epsilon
        ) {
            normal.add(signedUnitVectors[i + 3]);
        }

        if (
            i >= 3 &&
            Math.abs(fromCenterToIntersection.getComponent(i % 3) - aabbMax.getComponent(i % 3)) <
                epsilon
        ) {
            normal.add(signedUnitVectors[i - 3]);
        }
    }
    normal.normalize().multiplyScalar(aabb.containsPoint(ray.origin) ? 1 : -1);

    return [ { point: closestIntersection, normal: normal, distance: tNear > 0 ? tNear : tFar } ];
}

export type LineIntersectionPoint = {
    point: Vector3;
    distance: number;
}

/**
 * Unlike the `rayVsAabb` function, this one takes into account neither whether
 * the intersection point is behind the line "origin", nor the maximum distance
 * from the line "origin".
 *
 * @returns an array of intersection points
 * in order from the closest to the farthest (relative to the line "origin").
 * There are always either none or two intersection points in the array.
 */
export function lineVsAabb(line: THREE.Ray, aabb: THREE.Box3): LineIntersectionPoint[] {
    const normalizedDirection: Vector3 = line.direction.clone().normalize();

    const near: Vector3 = aabb.min.clone().sub(line.origin).divide(normalizedDirection);
    const far: Vector3 = aabb.max.clone().sub(line.origin).divide(normalizedDirection);
    let tNear: number = maxComponent(near.clone().min(far), 3);
    let tFar: number = minComponent(near.clone().max(far), 3);

    if (tNear > tFar) {
        return [];
    }

    if (Math.abs(tNear) > Math.abs(tFar)) {
        const swap: number = tNear;
        tNear = tFar;
        tFar = swap;
    }

    return [
        {
            point: line.origin.clone().add(normalizedDirection.clone().multiplyScalar(tNear)),
            distance: tNear,
        },
        {
            point: line.origin.clone().add(normalizedDirection.clone().multiplyScalar(tFar)),
            distance: tFar,
        },
    ];
}
