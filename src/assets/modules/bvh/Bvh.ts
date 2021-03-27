import * as THREE from 'three';
import { Vector3 } from 'three';

export interface BvhItem {
    position: Vector3;
}

export interface Bvh<TItem extends BvhItem> {
    insert(item: TItem): void;
    clear(): void;
    queryItemsFromSphere(
        sphereRange: THREE.Sphere,
        yieldItem: (item: TItem) => void,
    ): void;
    readonly mesh: THREE.Object3D;
    updateMesh(): void;
}
